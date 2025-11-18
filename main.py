from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Form
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import SQLModel, Field, Session, create_engine, select
from starlette.status import HTTP_303_SEE_OTHER
from datetime import datetime

# ============================================================
# DATABASE SETUP
# ============================================================

engine = create_engine("sqlite:///data/parts.db", echo=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    SQLModel.metadata.create_all(engine)
    yield


app = FastAPI(lifespan=lifespan)
templates = Jinja2Templates(directory="templates")
app.mount("/static", StaticFiles(directory="static"), name="static")

# ============================================================
# MODELS
# ============================================================

class Part(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    part_number: str
    category: str | None = None     # category name
    store: str | None = None        # store name
    description: str | None = None  # NEW: description
    price: float | None = None
    quantity: int = 0
    notes: str | None = None        # UI label: "Project Used"
    barcode: str | None = None
    bin_code: str | None = None


class Category(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str


class Store(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str


# ============================================================
# HOME PAGE
# ============================================================

@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})
#Find page

@app.get("/find", response_class=HTMLResponse)
def find_parts(request: Request, query: str | None = None, barcode: str | None = None):

    search_value = query or barcode or ""

    if not search_value:
        return templates.TemplateResponse("find.html",
                                          {"request": request, "parts": [], "search_value": ""})

    with Session(engine) as session:
        stmt = select(Part).where(
            (Part.part_number.ilike(f"%{search_value}%")) |
            (Part.description.ilike(f"%{search_value}%")) |
            (Part.category.ilike(f"%{search_value}%")) |
            (Part.store.ilike(f"%{search_value}%")) |
            (Part.barcode.ilike(f"%{search_value}%")) |
            (Part.bin_code.ilike(f"%{search_value}%"))
        )
        parts = session.exec(stmt).all()

    return templates.TemplateResponse("find.html",
                                      {"request": request, "parts": parts, "search_value": search_value})

# consume route

@app.post("/find/use/{part_id}")
def use_one_part(part_id: int, request: Request):

    referer = request.headers.get("referer", "/find")

    with Session(engine) as session:
        part = session.get(Part, part_id)

        if not part:
            return RedirectResponse(referer, status_code=303)

        if part.quantity > 0:
            part.quantity -= 1

            log_line = f"Used 1 on {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}"
            part.notes = (part.notes + "\n" if part.notes else "") + log_line

            session.add(part)
            session.commit()

    return RedirectResponse(referer, status_code=303)
# ============================================================
# PARTS LIST
# ============================================================

@app.get("/parts", response_class=HTMLResponse)
def parts_list(request: Request):
    with Session(engine) as session:
        parts = session.exec(select(Part)).all()
    return templates.TemplateResponse("parts.html", {"request": request, "parts": parts})


# ============================================================
# SEARCH PAGE
# ============================================================

@app.get("/search", response_class=HTMLResponse)
def search_page(request: Request, q: str | None = None):
    results = []
    query = (q or "").strip()

    if query:
        q_lower = query.lower()
        with Session(engine) as session:
            parts = session.exec(select(Part)).all()

        for p in parts:
            fields = [
                str(p.id or ""),
                p.part_number or "",
                p.category or "",
                p.store or "",
                p.description or "",
                str(p.price or ""),
                str(p.quantity or ""),
                p.barcode or "",
                p.bin_code or "",
                p.notes or "",
            ]
            if any(q_lower in f.lower() for f in fields):
                results.append(p)

    return templates.TemplateResponse(
        "search.html",
        {
            "request": request,
            "q": query,
            "results": results,
        },
    )


# ============================================================
# SCAN + RESULT
# ============================================================

@app.get("/scan", response_class=HTMLResponse)
def scan_page(request: Request):
    return templates.TemplateResponse("scan.html", {"request": request})


@app.get("/scan/result", response_class=HTMLResponse)
def scan_result(request: Request, barcode: str):
    with Session(engine) as session:
        part = session.exec(select(Part).where(Part.barcode == barcode)).first()

    if not part:
        return templates.TemplateResponse(
            "scan_result.html",
            {"request": request, "found": False, "barcode": barcode},
        )

    return templates.TemplateResponse(
        "scan_result.html",
        {"request": request, "found": True, "part": part},
    )


@app.post("/scan/remove_one")
def remove_one(part_id: int = Form(...), usage_note: str = Form("")):
    barcode_value = None

    with Session(engine) as session:
        part = session.get(Part, part_id)

        if part:
            barcode_value = part.barcode

            if usage_note:
                entry = f"Used: {usage_note}"
                part.notes = (part.notes + "\n" + entry) if part.notes else entry

            if part.quantity > 0:
                part.quantity -= 1

            session.add(part)
            session.commit()

    if not barcode_value:
        return RedirectResponse("/scan", status_code=HTTP_303_SEE_OTHER)

    return RedirectResponse(
        f"/scan/result?barcode={barcode_value}", status_code=HTTP_303_SEE_OTHER
    )


# ============================================================
# ADD PART (SINGLE)
# ============================================================

@app.get("/add", response_class=HTMLResponse)
def add_part_form(request: Request, barcode: str | None = None):
    with Session(engine) as session:
        categories = session.exec(select(Category)).all()
        stores = session.exec(select(Store)).all()
    return templates.TemplateResponse(
        "add_part.html",
        {
            "request": request,
            "barcode": barcode,
            "categories": categories,
            "stores": stores,
        },
    )


@app.post("/add")
def add_part(
    part_number: str = Form(...),
    category: str = Form(""),
    store: str = Form(""),
    description: str = Form(""),
    price: float | None = Form(None),
    quantity: int = Form(0),
    barcode: str = Form(""),
    bin_code: str = Form(""),
    notes: str = Form(""),
):
    new_part = Part(
        part_number=part_number,
        category=category,
        store=store,
        description=description,
        price=price,
        quantity=quantity,
        barcode=barcode,
        bin_code=bin_code,
        notes=notes,
    )

    with Session(engine) as session:
        session.add(new_part)
        session.commit()

    return RedirectResponse("/parts", status_code=HTTP_303_SEE_OTHER)


# ============================================================
# BULK ADD (5 ROWS)
# ============================================================

@app.get("/add/bulk", response_class=HTMLResponse)
def add_bulk_form(request: Request):
    with Session(engine) as session:
        categories = session.exec(select(Category)).all()
        stores = session.exec(select(Store)).all()
    rows = list(range(5))
    return templates.TemplateResponse(
        "add_bulk.html",
        {"request": request, "rows": rows, "categories": categories, "stores": stores},
    )


@app.post("/add/bulk")
def add_bulk(
    part_number: list[str] = Form(...),
    category: list[str] = Form(...),
    store: list[str] = Form(...),
    description: list[str] = Form(...),
    price: list[str] = Form(...),
    quantity: list[int] = Form(...),
    barcode: list[str] = Form(...),
    bin_code: list[str] = Form(...),
    notes: list[str] = Form(default_factory=list),
):
    with Session(engine) as session:
        for i in range(len(part_number)):
            def safe_str(v):
                return v if isinstance(v, str) else str(v) if v is not None else ""

            for i in range(len(part_number)):
                p = Part(
                    part_number=safe_str(part_number[i]).strip(),

                    category=safe_str(category[i]).strip() or None,
                    store=safe_str(store[i]).strip() or None,
                    description=safe_str(description[i]).strip() or None,

                    price=float(price[i]) if safe_str(price[i]).strip() else None,
                    quantity=int(quantity[i]) if safe_str(quantity[i]).strip() else 0,

                    notes=None,
                    barcode=safe_str(barcode[i]).strip() or None,
                    bin_code=safe_str(bin_code[i]).strip() or None,
                )
            session.add(p)

        session.commit()

    return RedirectResponse("/parts", status_code=HTTP_303_SEE_OTHER)


# ============================================================
# EDIT PART / DELETE PART
# ============================================================

@app.get("/part/{part_id}/edit", response_class=HTMLResponse)
def edit_part_form(part_id: int, request: Request):
    with Session(engine) as session:
        part = session.get(Part, part_id)
        categories = session.exec(select(Category)).all()
        stores = session.exec(select(Store)).all()

    return templates.TemplateResponse(
        "edit_part.html",
        {"request": request, "part": part, "categories": categories, "stores": stores},
    )


@app.post("/part/{part_id}/edit")
def edit_part(
    part_id: int,
    part_number: str = Form(...),
    category: str = Form(""),
    store: str = Form(""),
    description: str = Form(""),
    price: float | None = Form(None),
    quantity: int = Form(0),
    barcode: str = Form(""),
    bin_code: str = Form(""),
    notes: str = Form(""),
):
    with Session(engine) as session:
        part = session.get(Part, part_id)
        if part:
            part.part_number = part_number
            part.category = category
            part.store = store
            part.description = description
            part.price = price
            part.quantity = quantity
            part.barcode = barcode
            part.bin_code = bin_code
            part.notes = notes
            session.add(part)
            session.commit()

    return RedirectResponse("/parts", status_code=HTTP_303_SEE_OTHER)


@app.post("/part/{part_id}/delete")
def delete_part(part_id: int):
    with Session(engine) as session:
        part = session.get(Part, part_id)
        if part:
            session.delete(part)
            session.commit()

    return RedirectResponse("/parts", status_code=HTTP_303_SEE_OTHER)


# ============================================================
# HISTORY PAGE + DELETE SINGLE ENTRY ("Project Used")
# ============================================================

@app.get("/part/{part_id}/history", response_class=HTMLResponse)
def history_page(part_id: int, request: Request):
    with Session(engine) as session:
        part = session.get(Part, part_id)

    lines = []
    if part and part.notes:
        lines = part.notes.splitlines()

    return templates.TemplateResponse(
        "history.html",
        {"request": request, "part": part, "lines": lines},
    )


@app.post("/part/{part_id}/history/delete")
def delete_history_entry(part_id: int, index: int = Form(...)):
    with Session(engine) as session:
        part = session.get(Part, part_id)

        if part and part.notes:
            lines = part.notes.splitlines()
            if 0 <= index < len(lines):
                lines.pop(index)
                part.notes = "\n".join(lines) if lines else None
                session.add(part)
                session.commit()

    return RedirectResponse(f"/part/{part_id}/history", status_code=HTTP_303_SEE_OTHER)


# ============================================================
# SETTINGS PAGE (CATEGORIES + STORES)
# ============================================================

@app.get("/settings", response_class=HTMLResponse)
def settings_page(request: Request):
    with Session(engine) as session:
        categories = session.exec(select(Category)).all()
        stores = session.exec(select(Store)).all()
    return templates.TemplateResponse(
        "settings.html",
        {"request": request, "categories": categories, "stores": stores},
    )


# ---- Category handlers ----

@app.post("/settings/category/add")
def category_add(name: str = Form(...)):
    with Session(engine) as session:
        if name.strip():
            cat = Category(name=name.strip())
            session.add(cat)
            session.commit()
    return RedirectResponse("/settings", status_code=HTTP_303_SEE_OTHER)


@app.post("/settings/category/edit")
def category_edit(cat_id: int = Form(...), name: str = Form(...)):
    with Session(engine) as session:
        cat = session.get(Category, cat_id)
        if cat and name.strip():
            cat.name = name.strip()
            session.add(cat)
            session.commit()
    return RedirectResponse("/settings", status_code=HTTP_303_SEE_OTHER)


@app.post("/settings/category/delete")
def category_delete(cat_id: int = Form(...)):
    with Session(engine) as session:
        cat = session.get(Category, cat_id)
        if cat:
            session.delete(cat)
            session.commit()
    return RedirectResponse("/settings", status_code=HTTP_303_SEE_OTHER)


# ---- Store handlers ----

@app.post("/settings/store/add")
def store_add(name: str = Form(...)):
    with Session(engine) as session:
        if name.strip():
            s = Store(name=name.strip())
            session.add(s)
            session.commit()
    return RedirectResponse("/settings", status_code=HTTP_303_SEE_OTHER)


@app.post("/settings/store/edit")
def store_edit(store_id: int = Form(...), name: str = Form(...)):
    with Session(engine) as session:
        s = session.get(Store, store_id)
        if s and name.strip():
            s.name = name.strip()
            session.add(s)
            session.commit()
    return RedirectResponse("/settings", status_code=HTTP_303_SEE_OTHER)


@app.post("/settings/store/delete")
def store_delete(store_id: int = Form(...)):
    with Session(engine) as session:
        s = session.get(Store, store_id)
        if s:
            session.delete(s)
            session.commit()
    return RedirectResponse("/settings", status_code=HTTP_303_SEE_OTHER)
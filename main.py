from contextlib import asynccontextmanager
import os

from fastapi import FastAPI, Request, Form, HTTPException
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import SQLModel, Field, Session, create_engine, select
from starlette.status import HTTP_303_SEE_OTHER
from datetime import datetime

# ============================================================
# DATABASE SETUP
# ============================================================

os.makedirs("data", exist_ok=True)
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


def safe_str(value: str | int | float | None) -> str:
    if value is None:
        return ""
    return value if isinstance(value, str) else str(value)


def normalize_text(value: str | int | float | None) -> str | None:
    text = safe_str(value).strip()
    return text or None


def parse_price(value: str | int | float | None) -> float | None:
    text = safe_str(value).strip()
    if not text:
        return None
    try:
        price = float(text)
    except ValueError:
        return None
    return price if price >= 0 else None


def parse_quantity(value: str | int | float | None) -> int:
    text = safe_str(value).strip()
    if not text:
        return 0
    try:
        quantity = int(text)
    except ValueError:
        return 0
    return max(quantity, 0)


def blank_if_none_word(value: str | int | float | None) -> str:
    text = safe_str(value).strip()
    return "" if text.lower() == "none" else text


def format_usage_log(prefix: str, detail: str | None = None) -> str:
    timestamp = datetime.now().strftime("%m/%d/%Y %I:%M %p")
    if detail:
        return f"{prefix} on {timestamp}: {detail}"
    return f"{prefix} on {timestamp}"


def append_note(part: "Part", entry: str) -> None:
    part.notes = f"{part.notes}\n{entry}" if part.notes else entry


def log_inventory_addition(part: "Part", amount: int, source: str | None = None) -> None:
    if amount <= 0:
        return
    detail = source.strip() if source else None
    append_note(part, format_usage_log(f"Inventory added (+{amount})", detail))


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
            raise HTTPException(status_code=404, detail="Part not found")

        if part.quantity > 0:
            part.quantity -= 1

            append_note(part, format_usage_log("Used 1"))

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
        pattern = f"%{query}%"
        with Session(engine) as session:
            stmt = select(Part).where(
                (Part.part_number.ilike(pattern))
                | (Part.category.ilike(pattern))
                | (Part.store.ilike(pattern))
                | (Part.description.ilike(pattern))
                | (Part.barcode.ilike(pattern))
                | (Part.bin_code.ilike(pattern))
                | (Part.notes.ilike(pattern))
            )
            results = session.exec(stmt).all()

    return templates.TemplateResponse(
        "search.html",
        {
            "request": request,
            "q": query,
            "results": results,
        },
    )


@app.get("/decoder", response_class=HTMLResponse)
def decoder_page(request: Request):
    return templates.TemplateResponse("decoder.html", {"request": request})


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

        if not part:
            raise HTTPException(status_code=404, detail="Part not found")

        barcode_value = part.barcode

        detail = normalize_text(usage_note)

        if part.quantity > 0:
            part.quantity -= 1
            append_note(part, format_usage_log("Used 1", detail))
        elif detail:
            append_note(part, format_usage_log("Usage note", detail))

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
    price: str = Form(""),
    quantity: str = Form("0"),
    barcode: str = Form(""),
    bin_code: str = Form(""),
    notes: str = Form(""),
):
    normalized_part_number = part_number.strip()

    if not normalized_part_number:
        raise HTTPException(status_code=400, detail="Part number is required")

    new_part = Part(
        part_number=normalized_part_number,
        category=normalize_text(category),
        store=normalize_text(store),
        description=normalize_text(description),
        price=parse_price(price),
        quantity=parse_quantity(quantity),
        barcode=normalize_text(barcode),
        bin_code=normalize_text(bin_code),
        notes=normalize_text(notes),
    )

    log_inventory_addition(new_part, new_part.quantity, "Single add")

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
    rows = [
        {
            "part_number": "",
            "category": "",
            "store": "",
            "description": "",
            "price": "",
            "quantity": "1",
            "barcode": "",
            "bin_code": "",
        }
        for _ in range(5)
    ]
    return templates.TemplateResponse(
        "add_bulk.html",
        {
            "request": request,
            "rows": rows,
            "categories": categories,
            "stores": stores,
            "error_message": None,
        },
    )


@app.post("/add/bulk")
def add_bulk(
    request: Request,
    part_number: list[str] = Form(...),
    category: list[str] = Form([]),
    store: list[str] = Form([]),
    description: list[str] = Form([]),
    price: list[str] = Form([]),
    quantity: list[str] = Form([]),
    barcode: list[str] = Form([]),
    bin_code: list[str] = Form([]),
    notes: list[str] = Form([]),
):
    def render_error(message: str, rows_data: list[dict[str, str]]):
        return templates.TemplateResponse(
            "add_bulk.html",
            {
                "request": request,
                "rows": rows_data,
                "categories": categories,
                "stores": stores,
                "error_message": message,
            },
            status_code=400,
        )

    with Session(engine) as session:
        categories = session.exec(select(Category)).all()
        stores = session.exec(select(Store)).all()
        rows: list[dict[str, str]] = []
        any_saved = False

        for i in range(len(part_number)):
            row = {
                "part_number": safe_str(part_number[i]).strip(),
                "category": blank_if_none_word(category[i]) if i < len(category) else "",
                "store": blank_if_none_word(store[i]) if i < len(store) else "",
                "description": blank_if_none_word(description[i]) if i < len(description) else "",
                "price": blank_if_none_word(price[i]) if i < len(price) else "",
                "quantity": blank_if_none_word(quantity[i]) if i < len(quantity) else "",
                "barcode": blank_if_none_word(barcode[i]) if i < len(barcode) else "",
                "bin_code": blank_if_none_word(bin_code[i]) if i < len(bin_code) else "",
            }
            rows.append(row)

            normalized_part_number = row["part_number"]

            if not normalized_part_number:
                continue

            price_value = None
            if row["price"]:
                price_value = parse_price(row["price"])
                if price_value is None:
                    return render_error(f"Row {i + 1}: Invalid price '{row['price']}'.", rows)

            quantity_value = 0
            if row["quantity"]:
                try:
                    quantity_value = int(row["quantity"])
                except ValueError:
                    return render_error(f"Row {i + 1}: Invalid quantity '{row['quantity']}'.", rows)
                if quantity_value < 0:
                    return render_error(f"Row {i + 1}: Quantity cannot be negative.", rows)
            else:
                quantity_value = 0

            existing_part = session.exec(
                select(Part).where(Part.part_number == normalized_part_number)
            ).first()

            if existing_part:
                existing_part.quantity = (existing_part.quantity or 0) + quantity_value
                log_inventory_addition(existing_part, quantity_value, "Bulk add")
                session.add(existing_part)
            else:
                p = Part(
                    part_number=normalized_part_number,
                    category=normalize_text(row["category"]),
                    store=normalize_text(row["store"]),
                    description=normalize_text(row["description"]),
                    price=price_value,
                    quantity=quantity_value,
                    notes=normalize_text(notes[i]) if i < len(notes) else None,
                    barcode=normalize_text(row["barcode"]),
                    bin_code=normalize_text(row["bin_code"]),
                )
                log_inventory_addition(p, quantity_value, "Bulk add")
                session.add(p)

            any_saved = True

        if not any_saved:
            return render_error("Enter at least one part number.", rows)

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
    price: str = Form(""),
    quantity: str = Form("0"),
    barcode: str = Form(""),
    bin_code: str = Form(""),
    notes: str = Form(""),
):
    with Session(engine) as session:
        part = session.get(Part, part_id)
        if part:
            normalized_part_number = part_number.strip()

            if not normalized_part_number:
                raise HTTPException(status_code=400, detail="Part number is required")

            part.part_number = normalized_part_number
            part.category = normalize_text(category)
            part.store = normalize_text(store)
            part.description = normalize_text(description)
            part.price = parse_price(price)
            part.quantity = parse_quantity(quantity)
            part.barcode = normalize_text(barcode)
            part.bin_code = normalize_text(bin_code)
            part.notes = normalize_text(notes)
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

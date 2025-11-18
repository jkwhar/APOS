// =====================================================
// ELECTRONIC AUTOFILL ENGINE — CLEAN + FIXED VERSION
// =====================================================

// ------------------------
// Helper: Set Category
// ------------------------
function setCategory(selectElem, targetText) {
    if (!selectElem) return;
    targetText = targetText.trim().toLowerCase();
    for (let o of selectElem.options) {
        if (o.text.trim().toLowerCase() === targetText) {
            selectElem.value = o.value;
            return;
        }
    }
}

// ------------------------
// Helper: Extract tolerance
// ------------------------
function extractTolerance(pn) {
    const tol = pn.match(/(1%|2%|5%|10%|20%)/i);
    return tol ? tol[1].toUpperCase() : "";
}

// ------------------------
// Helper: Extract wattage
// ------------------------
function extractWattage(pn) {
    const w = pn.match(/(\d+(\.\d+)?W)/i);
    return w ? w[1].toUpperCase() : "";
}

// ------------------------
// Helper: Extract voltage
// ------------------------
function extractVoltage(pn) {
    const v = pn.match(/(\d+V)/i);
    return v ? v[1].toUpperCase() : "";
}

// ------------------------
// Helper: Format resistor values
// ------------------------
function formatResistor(val) {
    // Examples:
    // 4700 → 4K7
    // 470 → 470R
    val = val.toUpperCase();

    if (val.endsWith("000")) return (parseInt(val) / 1000) + "K";

    if (parseInt(val) >= 1000)
        return (parseInt(val) / 1000 + "").replace(".", "K");

    return val + "R";
}

// ------------------------
// CAPACITOR VALUE PARSING
// ------------------------
function parseCapacitance(raw) {
    if (!raw) return null;
    raw = raw.toLowerCase();

    // 4u7 , 4r7u → 4.7uF
    let m = raw.match(/(\d+)[ur](\d+)/);
    if (m) return `${m[1]}.${m[2]}uF`;

    // 10u → 10uF
    m = raw.match(/(\d+)u/);
    if (m) return `${m[1]}uF`;

    // 4.7uf → 4.7uF
    m = raw.match(/([\d\.]+)\s*u?f/);
    if (m) return `${m[1]}uF`;

    return null;
}

// ------------------------
// Build Capacitor Description
// ------------------------
function buildCapacitorDescription(lower) {
    // match CAP-4u7-16V
    let capMatch = lower.match(/cap[-_]?([0-9a-z\.]+u[0-9a-z]*)/);
    let uf = capMatch ? parseCapacitance(capMatch[1]) : null;

    let volt = null;
    let vMatch = lower.match(/(\d+)\s*v/);
    if (vMatch) volt = `${vMatch[1]}V`;

    let desc = "";
    if (uf) desc += uf;
    if (volt) desc += (desc ? " " : "") + volt;

    return desc || null;
}

// =====================================================
// MAIN ENTRY — AUTO FILL
// =====================================================

function autoFillFromPartNumber(inputElem) {
    let pn = inputElem.value.trim();
    if (!pn) return;

    let lower = pn.toLowerCase();

    // Ensure we get row whether bulk or single
    let row = inputElem.closest("tr");
    if (!row) row = inputElem.closest("form") || document;

    let descField = row.querySelector("input[name='description']");
    let catField  = row.querySelector("select[name='category']");

    // fallback
    if (!descField) descField = document.querySelector("input[name='description']");
    if (!catField)  catField  = document.querySelector("select[name='category']");

    if (!descField || !catField) return;

    // ==============================
    // CAPACITOR RULES (robust)
    // ==============================
    let capToken = lower.match(/(\d+r\d+u?|\d+u\d+|\d+u|cap[-_]\d+[a-z0-9]+)/);
    if (capToken) {
        let uf = parseCapacitance(capToken[1]);
        let volt = extractVoltage(lower);
        let finalDesc = uf ? uf.toUpperCase() : "";

        if (volt) finalDesc += finalDesc ? ", " + volt : volt;

        if (finalDesc) {
            descField.value = finalDesc;
            setCategory(catField, "Capacitor");
            return;
        }
    }

    // ==============================
    // RESISTOR RULES
    // ==============================
    // Examples: RES-470R, RES-4K7, RES470R
    let res = lower.match(/res[-_]?(\d+)([rRkK]\d+)?/);
    if (res) {
        let base = res[1];
        let extra = res[2] || "";

        let value = parseCapacitance(base) || formatResistor(base);
        let watt = extractWattage(pn);
        let tol  = extractTolerance(pn);

        descField.value = `${value}${extra}${watt ? ", " + watt : ""}${tol ? ", " + tol : ""}`;
        setCategory(catField, "Resistor");
        return;
    }

    // ==============================
    // ESP32 / Modules
    // ==============================
    if (/esp32/i.test(pn)) {
        descField.value = "ESP32 series microcontroller";
        setCategory(catField, "MCU");
        return;
    }

    // ----------------------------------------------
    // AUTO ADD NEW ROW WHEN LAST PART NUMBER FILLED
    // ----------------------------------------------
    const all = document.querySelectorAll("input[name='part_number']");
    if (all.length && all[all.length - 1] === inputElem && pn !== "") {
        if (typeof addRow === "function") addRow();
    }
}

// =====================================================
// BULK PASTE SUPPORT — FIXED
// =====================================================

function fillBulkPaste(textareaId) {
    let raw = document.getElementById(textareaId).value;
    if (!raw) return;

    let lines = raw.split(/\r?\n/).map(l => l.trim()).filter(l => l !== "");

    lines.forEach((val, index) => {
        let parts = document.querySelectorAll("input[name='part_number']");

        // Ensure enough rows exist
        if (index >= parts.length && typeof addRow === "function") {
            addRow();
            parts = document.querySelectorAll("input[name='part_number']");
        }

        let field = parts[index];
        field.value = val;

        // Simulate user typing to trigger all autofill
        field.dispatchEvent(new Event("input", { bubbles: true }));
        autoFillFromPartNumber(field);
    });
}
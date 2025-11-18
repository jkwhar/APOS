// ==========================
// ELECTRONIC VALUE HELPERS
// ==========================

// Convert raw numeric values into electronics shorthand
function formatValue(val, unit) {
    val = val.toUpperCase();

    // ----- Resistors -----
    if (unit === "R") {
        // 4700 → 4K7
        if (val.endsWith("000")) return (parseInt(val) / 1000) + "K";
        if (/^\d+K\d+$/i.test(val)) return val.toUpperCase();
        if (parseInt(val) >= 1000)
            return (parseInt(val) / 1000 + "").replace(".", "K");
        return val + "R";
    }

    // ----- Capacitors -----
    if (unit === "F") {
        // Normalize uF-style values
        const ufMatch = val.match(/([\d\.]+)\s*u?f?/i);
        if (ufMatch) return `${ufMatch[1]}u`;
        return val;
    }

    return val;
}

// Extract tolerance such as 1%, 5%, 10%, 20%
function extractTolerance(pn) {
    const tol = pn.match(/(1%|2%|5%|10%|20%)/i);
    return tol ? tol[1].toUpperCase() : "";
}

// Extract wattage rating for resistors
function extractWattage(pn) {
    const w = pn.match(/(\d+(\.\d+)?W)/i);
    return w ? w[1].toUpperCase() : "";
}

// Extract voltage rating for capacitors
function extractVoltage(pn) {
    const v = pn.match(/(\d+V)/i);
    return v ? v[1].toUpperCase() : "";
}

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

function autoFillFromPartNumber(inputElem) {
    let pn = inputElem.value.trim();
    if (!pn) return;

    // Find the correct row context (bulk add or single add)
    let row = inputElem.closest("tr");
    if (!row) {
        // fallback for single add page
        row = inputElem.closest("form") || document;
    }

    // Always search *inside this row only*
    let descField = row.querySelector("input[name='description']");
    let catField  = row.querySelector("select[name='category']");

    // If still not found (single add page), fallback
    if (!descField) descField = document.querySelector("input[name='description']");
    if (!catField)  catField  = document.querySelector("select[name='category']");

    if (!descField || !catField) return;

    // ==========================
    // CAPACITOR
    // ==========================
    let cap = pn.match(/CAP[-_]?(\d+u?F?)[-_](\d+V)/i);
    if (cap) {
        let value = formatValue(cap[1], "F");
        let voltage = extractVoltage(pn);
        let tol = extractTolerance(pn);
        descField.value = `${value}F${voltage ? ", " + voltage : ""}${tol ? ", " + tol : ""}`;
        setCategory(catField, "Capacitor");
        return;
    }

    // ==========================
    // RESISTOR
    // ==========================
    let res = pn.match(/RES[-_]?(\d+)[rRkK]?[._-](\d+)/);
    if (res) {
        let val = res[1];
        let size = res[2];
        let value = formatValue(val, "R");
        let watt = extractWattage(pn);
        let tol = extractTolerance(pn);
        descField.value = `${value}${watt ? ", " + watt : ""}${tol ? ", " + tol : ""}`;
        setCategory(catField, "Resistor");
        return;
    }

    // ==========================
    // LED
    // ==========================
    let led = pn.match(/LED[-_]?([A-Z]+).*?(\d+MM)/);
    if (led) {
        let tol = extractTolerance(pn);
        descField.value = `${led[1]}, ${led[2]}${tol ? ", " + tol : ""}`;
        setCategory(catField, "LED");
        return;
    }

    // ==========================
    // ESP32 / ESP Modules
    // ==========================
    if (/ESP32/i.test(pn)) {
        descField.value = "ESP32 series microcontroller";
        setCategory(catField, "MCU");
        return;
    }

    // === AUTO ADD ROW WHEN LAST PART NUMBER IS FILLED ===
    const allPN = document.querySelectorAll("input[name='part_number']");
    if (allPN.length && allPN[allPN.length - 1] === inputElem && inputElem.value.trim() !== "") {
        if (typeof addRow === "function") addRow();
    }
}

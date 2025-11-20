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

function categoryOptionExists(selectElem, targetText) {
    if (!selectElem || !targetText) return false;
    const normalized = targetText.trim().toLowerCase();
    if (!normalized) return false;
    return Array.from(selectElem.options).some(
        (o) => o.text.trim().toLowerCase() === normalized
    );
}

function getCategoryPrefixMappings() {
    if (typeof window === "undefined") return [];
    if (!Array.isArray(window.categoryPrefixMappings)) {
        window.categoryPrefixMappings = [];
    }
    return window.categoryPrefixMappings;
}

function findMappedCategory(partNumber) {
    if (!partNumber) return null;
    const normalizedPN = partNumber.trim().toLowerCase();
    if (!normalizedPN) return null;

    const mappings = getCategoryPrefixMappings();
    let bestMatch = null;

    for (const entry of mappings) {
        if (!entry || !entry.prefix || !entry.category) continue;
        const prefixNormalized = entry.prefix.trim().toLowerCase();
        if (!prefixNormalized) continue;
        if (normalizedPN.startsWith(prefixNormalized)) {
            if (!bestMatch || prefixNormalized.length > bestMatch.length) {
                bestMatch = { category: entry.category, length: prefixNormalized.length };
            }
        }
    }

    return bestMatch ? bestMatch.category : null;
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
    const upper = val.toUpperCase();
    const shorthandMatch = upper.match(/^(\d+)([RKM])(\d+)$/);
    if (shorthandMatch) {
        const leading = shorthandMatch[1];
        const trailing = shorthandMatch[3];
        const prefix = shorthandMatch[2] === "K" ? "k" : shorthandMatch[2] === "M" ? "M" : "";
        const decimal = Number(`${leading}.${trailing}`);
        return `${decimal}${prefix}Ω`;
    }

    const numericMatch = upper.match(/^(\d+(\.\d+)?)([RKM])$/);
    if (numericMatch) {
        const value = parseFloat(numericMatch[1]);
        const prefix = numericMatch[3] === "K" ? "k" : numericMatch[3] === "M" ? "M" : "";
        return `${value}${prefix}Ω`;
    }

    const rMatch = upper.match(/^(\d+(\.\d+)?)R$/);
    if (rMatch) {
        return `${parseFloat(rMatch[1])}Ω`;
    }

    const numeric = parseFloat(val);
    if (!Number.isNaN(numeric)) {
        if (numeric >= 1_000_000) {
            return `${(numeric / 1_000_000).toFixed(2).replace(/\.00$/, "")}MΩ`;
        }
        if (numeric >= 1_000) {
            return `${(numeric / 1_000).toFixed(2).replace(/\.00$/, "")}kΩ`;
        }
        return `${numeric}Ω`;
    }

    return val.replace(/R/i, "Ω");
}

// ------------------------
// CAPACITOR VALUE PARSING
// ------------------------
function normalizeWattage(wattStr) {
    if (!wattStr) return "";
    const match = wattStr.match(/([\d.]+)/);
    if (!match) return wattStr;
    const numeric = parseFloat(match[1]);
    if (Number.isNaN(numeric)) return wattStr;
    const fractions = {
        0.125: "1/8w",
        0.25: "1/4w",
        0.5: "1/2w",
        0.75: "3/4w",
    };
    if (fractions[numeric]) return fractions[numeric];
    if (Number.isInteger(numeric)) return `${numeric}w`;
    return `${numeric}w`;
}

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

// ------------------------
// Mechanical description builder
// ------------------------
const MECHANICAL_TYPE_DETAILS = {
    hst: { label: "Heat Shrink", category: "Mechanical", specSuffix: "", joiner: " - " },
    shrink: { label: "Heat Shrink", category: "Mechanical", specSuffix: "", joiner: " - " },
    heatshrink: { label: "Heat Shrink", category: "Mechanical", specSuffix: "", joiner: " - " },
    nut: { label: "Nut", category: "Mechanical", specSuffix: "", joiner: " " },
    blt: { label: "Bolt", category: "Mechanical", specSuffix: "", joiner: " - " },
    wsh: { label: "Washer", category: "Mechanical", specSuffix: " diameter", joiner: " " },
    rng: { label: "O-Ring", category: "Mechanical", specSuffix: " diameter", joiner: " " },
    spc: { label: "Spacer", category: "Mechanical", specSuffix: " diameter", joiner: " " },
    stf: { label: "Standoff", category: "Mechanical", specSuffix: "", joiner: " - " },
    standoff: { label: "Standoff", category: "Mechanical", specSuffix: "", joiner: " - " },
    spacer: { label: "Spacer", category: "Mechanical", specSuffix: " diameter", joiner: " " },
    washer: { label: "Washer", category: "Mechanical", specSuffix: " diameter", joiner: " " },
    bearing: { label: "Bearing", category: "Mechanical", specSuffix: " diameter", joiner: " " },
};

const GENERIC_PREFIX_SKIP = new Set(["mec", "res", "cap", "ic", "mcu", "pcb", "asm"]);

function normalizeToken(token) {
    if (!token) return "";
    let normalized = token.trim();
    if (normalized.includes("_")) {
        if (/^\d+(?:_\d+)+(?:in)?$/i.test(normalized)) {
            normalized = normalized.replace(/_/g, "/");
        } else {
            normalized = normalized.replace(/_/g, " ");
        }
    }
    return normalized;
}

function mmToInchesRounded(mm) {
    const parsed = parseFloat(mm);
    if (Number.isNaN(parsed)) return null;
    return Math.round((parsed / 25.4) * 20) / 20;
}

function formatInches(inches, { stripLeadingZero = true } = {}) {
    if (inches === null || inches === undefined) return "";
    let str = inches.toFixed(2);

    if (inches >= 1) {
        str = str.replace(/(\.\d*[1-9])0$/, "$1").replace(/\.00$/, "");
    }
    if (stripLeadingZero && inches > 0 && inches < 1) {
        str = str.replace(/^0/, "");
    }

    return `${str}"`;
}

function formatMechanicalSize(token, options = {}) {
    const normalized = normalizeToken(token);
    if (!normalized) return "";
    const { sizeToken = false } = options;

    if (/^\d+\/\d+$/i.test(normalized)) {
        return `${normalized}"`;
    }

    if (/^\d+\/\d+in$/i.test(normalized)) {
        const value = normalized.replace(/in$/i, "");
        return `${value}"`;
    }

    if (/^\d+(mm|cm|m|in)$/i.test(normalized)) {
        if (/in$/i.test(normalized)) {
            return normalized.toUpperCase().replace(/IN$/i, '"');
        }
        const mm = parseFloat(normalized);
        if (!Number.isNaN(mm)) {
            return formatInches(mmToInchesRounded(mm));
        }
    }

    if (/^\d+(?:\.\d+)?$/i.test(normalized)) {
        if (sizeToken && /^\d+$/.test(normalized)) {
            return `M${normalized}`;
        }
        return formatInches(mmToInchesRounded(normalized));
    }

    if (/^m\d+/i.test(normalized)) {
        return normalized.toUpperCase();
    }

    return normalized.length <= 3
        ? normalized.toUpperCase()
        : normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
}

function formatMechanicalSpec(token) {
    const normalized = normalizeToken(token);
    if (!normalized) return "";

    if (/^\d+(mm)?$/i.test(normalized)) {
        return formatInches(mmToInchesRounded(normalized));
    }

    if (/^\d+\/\d+$/i.test(normalized)) {
        return `${normalized}"`;
    }

    return formatMechanicalSize(token);
}

function normalizeRatingToken(token) {
    if (!token) return "";
    const normalized = token.trim().toLowerCase();
    if (!normalized) return "";
    const match = normalized.match(/^(\d+(?:\.\d+)?)(kv|v|ma|a)$/);
    if (!match) return "";
    let [, value, unit] = match;
    if (unit === "ma") {
        unit = "mA";
    } else if (unit === "kv") {
        unit = "kV";
    } else {
        unit = unit.toUpperCase();
    }
    const normalizedValue = value.replace(/(\.\d*[1-9])0+$/, "$1").replace(/\.0+$/, "");
    return `${normalizedValue}${unit}`;
}

function formatInductorValue(raw) {
    if (!raw) return "";
    let token = raw.trim().toLowerCase();
    if (!token) return "";
    token = token.replace(/h$/i, "").replace(/µ/g, "u");
    if (/^\d+[mun]\d*$/i.test(token)) {
        return token.toLowerCase();
    }
    const match = token.match(/^(\d+)(?:\.(\d+))?([mun])?$/);
    if (!match) {
        return token.toLowerCase();
    }
    const integer = match[1];
    const decimal = match[2] || "";
    const unit = match[3] || "u";
    if (decimal) {
        return `${integer}${unit}${decimal}`;
    }
    return `${integer}${unit}`;
}

function buildMechanicalDescription(pn) {
    if (!pn) return null;

    let cleaned = pn;
    if (/^mec[-_]/i.test(pn)) {
        cleaned = pn.replace(/^mec[-_]?/i, "");
    }

    const segments = cleaned.split(/-/).map((t) => t.trim()).filter(Boolean);
    if (!segments.length) return null;

    const [rawType, ...rest] = segments;
    const typeKey = rawType.toLowerCase();
    const typeDetail = MECHANICAL_TYPE_DETAILS[typeKey];
    if (!typeDetail) return null;
    const typeLabel = typeDetail?.label || formatMechanicalSize(rawType);

    if (!rest.length) {
        return {
            description: typeLabel,
            category: typeDetail?.category || null,
            typeLabel,
        };
    }

    const sizeDesc = formatMechanicalSize(rest[0], { sizeToken: true });
    const specTokens = rest.slice(1).map(formatMechanicalSpec).filter(Boolean);
    let specDesc = specTokens.join(" ");

    if (specDesc && typeDetail?.specSuffix) {
        specDesc = `${specDesc}${typeDetail.specSuffix}`;
    }

    let description = typeLabel;
    if (sizeDesc) {
        description += ` ${sizeDesc}`;
    }

    if (specDesc) {
        const joiner = typeDetail?.joiner ?? " ";
        description += `${joiner}${specDesc}`;
    }

    return {
        description: description.trim(),
        category: typeDetail?.category || null,
        typeLabel,
    };
}

function buildDiodeDescription(pn) {
    if (!/^dio[-_]/i.test(pn)) return null;
    const cleaned = pn.replace(/^dio[-_]?/i, "");
    if (!cleaned) return null;
    const segments = cleaned.split(/[-_]/).map((t) => t.trim()).filter(Boolean);
    if (!segments.length) return null;
    const value = segments[0].toUpperCase();
    const rating = segments.slice(1).map(normalizeRatingToken).find(Boolean);
    const parts = [value];
    if (rating) parts.push(rating);
    return {
        description: parts.join(", "),
        category: "Diode",
    };
}

function buildTransistorDescription(pn) {
    if (!/^trn[-_]/i.test(pn)) return null;
    const cleaned = pn.replace(/^trn[-_]?/i, "");
    if (!cleaned) return null;
    const segments = cleaned.split(/[-_]/).map((t) => t.trim()).filter(Boolean);
    if (!segments.length) return null;
    const value = segments[0].toUpperCase();
    const rating = segments.slice(1).map(normalizeRatingToken).find(Boolean);
    const parts = [value];
    if (rating) parts.push(rating);
    return {
        description: parts.join(", "),
        category: "Transistor",
    };
}

function buildInductorDescription(pn) {
    if (!/^ind[-_]/i.test(pn)) return null;
    const cleaned = pn.replace(/^ind[-_]?/i, "");
    if (!cleaned) return null;
    const segments = cleaned.split(/[-_]/).map((t) => t.trim()).filter(Boolean);
    if (!segments.length) return null;
    const valueToken = formatInductorValue(segments[0]);
    if (!valueToken) return null;
    const rating = segments.slice(1).map(normalizeRatingToken).find(Boolean);
    const parts = [valueToken];
    if (rating) parts.push(rating);
    return {
        description: parts.join(", "),
        category: "Inductor",
    };
}

function buildICDescription(pn) {
    if (!/^ic[-_]/i.test(pn)) return null;
    const cleaned = pn.replace(/^ic[-_]?/i, "");
    const value = cleaned.trim();
    if (!value) return null;
    return {
        description: value.toUpperCase(),
        category: "IC",
    };
}

function formatGeneralToken(token) {
    const normalized = normalizeToken(token);
    if (!normalized) return "";

    if (/^\d+\/\d+$/i.test(normalized)) {
        return `${normalized}"`;
    }

    if (/^\d+(mm|cm|in|ft)$/i.test(normalized)) {
        return normalized.toUpperCase();
    }

    if (/^\d+$/i.test(normalized)) {
        return normalized;
    }

    if (normalized.length <= 3) {
        return normalized.toUpperCase();
    }

    return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
}

function fallbackDescriptionFromPartNumber(pn) {
    const tokens = pn.split(/[-_]/).map((t) => t.trim()).filter(Boolean);
    if (!tokens.length) return "";

    const filtered = tokens.filter((token, index) => {
        if (index !== 0) return true;
        return !GENERIC_PREFIX_SKIP.has(token.toLowerCase());
    });

    if (!filtered.length) return "";

    return filtered
        .map(formatGeneralToken)
        .filter(Boolean)
        .join(" ")
        .trim();
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

    const mappedCategory = findMappedCategory(pn);
    let categoryLocked = false;
    let mappedCategoryLower = null;
    if (mappedCategory) {
        mappedCategoryLower = mappedCategory.trim().toLowerCase();
        setCategory(catField, mappedCategory);
        categoryLocked = true;
    }

    const applyAutofill = (description, category) => {
        if (description) {
            descField.value = description;
        }
        if (category) {
            const normalizedCategory = category.trim().toLowerCase();
            if (
                !categoryLocked ||
                (mappedCategoryLower && normalizedCategory === mappedCategoryLower)
            ) {
                setCategory(catField, category);
                if (!categoryLocked) {
                    categoryLocked = true;
                }
            }
        }
        return true;
    };

// ==============================
// Mechanical parts (HST/WSH/...)
// ==============================
const mechanicalInfo = buildMechanicalDescription(pn);
    if (mechanicalInfo) {
        let categoryToApply = mechanicalInfo.category;
        if (
            !categoryToApply &&
            mechanicalInfo.typeLabel &&
            categoryOptionExists(catField, mechanicalInfo.typeLabel)
        ) {
            categoryToApply = mechanicalInfo.typeLabel;
        }

        applyAutofill(mechanicalInfo.description, categoryToApply);
        return;
    }

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
            applyAutofill(finalDesc, "Capacitor");
            return;
        }
    }

    // ==============================
    // RESISTOR RULES
    // ==============================
    // Examples: RES-470R, RES-4K7, RES470R
    const resistorMatch = pn.match(/res[-_]?([0-9a-z\.]+)/i);
    if (resistorMatch) {
        const valueToken = resistorMatch[1];
        const formattedValue = formatResistor(valueToken);
        const watt = normalizeWattage(extractWattage(pn));
        const tolerance = extractTolerance(pn);

        const parts = [formattedValue];
        if (watt) parts.push(watt);
        if (tolerance) parts.push(tolerance);

        applyAutofill(parts.join(", "), "Resistor");
        return;
    }

    const diodeInfo = buildDiodeDescription(pn);
    if (diodeInfo) {
        applyAutofill(diodeInfo.description, diodeInfo.category);
        return;
    }

    const transistorInfo = buildTransistorDescription(pn);
    if (transistorInfo) {
        applyAutofill(transistorInfo.description, transistorInfo.category);
        return;
    }

    const inductorInfo = buildInductorDescription(pn);
    if (inductorInfo) {
        applyAutofill(inductorInfo.description, inductorInfo.category);
        return;
    }

    const icInfo = buildICDescription(pn);
    if (icInfo) {
        applyAutofill(icInfo.description, icInfo.category);
        return;
    }

    // ==============================
    // ESP32 / Modules
    // ==============================
    if (/esp32/i.test(pn)) {
        applyAutofill("ESP32 series microcontroller", "MCU");
        return;
    }

    // ==============================
    // Generic fallback: humanize tokens
    // ==============================
    if (!descField.value) {
        const fallbackDesc = fallbackDescriptionFromPartNumber(pn);
        if (fallbackDesc) {
            applyAutofill(fallbackDesc, null);
            return;
        }
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

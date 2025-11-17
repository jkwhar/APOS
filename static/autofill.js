function autoFillFromPartNumber(inputElem) {
    let pn = inputElem.value.trim();
    if (!pn) return;

    let row = inputElem.closest("tr") ?? document;

    let descField = row.querySelector("[name='description']") ?? document.querySelector("[name='description']");
    let catField  = row.querySelector("[name='category']") ?? document.querySelector("[name='category']");

    // ==========================
    // CAPACITOR
    // ==========================
    let cap = pn.match(/CAP[-_]?(\d+u?F?)[-_](\d+V)/i);
    if (cap) {
        descField.value = `${cap[1]}, ${cap[2]}`;
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
        descField.value = `${val}Ω, ${size}`;
        setCategory(catField, "Resistor");
        return;
    }

    // ==========================
    // LED
    // ==========================
    let led = pn.match(/LED[-_]?([A-Z]+).*?(\d+MM)/);
    if (led) {
        descField.value = `${led[1]}, ${led[2]}`;
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
}

function setCategory(selectElem, targetText) {
    if (!selectElem) return;
    for (let o of selectElem.options) {
        if (o.text.toLowerCase() === targetText.toLowerCase()) {
            selectElem.value = o.value;
            return;
        }
    }
}
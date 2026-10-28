// UX 7-3 close: ticks each line of the password rule (login-update-password.ftl) as the person types. Only a hint: the
// realm's policy still decides on submit. Each line carries its state in words for screen readers (read when the rule
// is reached through the field's aria-describedby), not announced on every keystroke. A classic deferred script in a
// block, not a module: it has no imports, and it then also runs on the file:// harness. The tests follow Keycloak's
// policies (Java Character classes, UTF-16 length), so an Arabic letter is a letter, never a symbol.
{
    const list = document.querySelector("#kc-password-rule ul[data-for]");
    const field = list && document.getElementById(list.dataset.for);

    const count = (value, pattern) => (value.match(pattern) || []).length;
    const tests = {
        length: (value, min) => value.length >= min,
        upper: (value, min) => count(value, /\p{Lu}/gu) >= min,
        lower: (value, min) => count(value, /\p{Ll}/gu) >= min,
        digits: (value, min) => count(value, /\p{Nd}/gu) >= min,
        special: (value, min) => count(value, /[^\p{L}\p{Nd}]/gu) >= min,
        // Without a known email the line is left unmarked rather than ticked on a guess.
        notEmail: (value) => list.dataset.email
            ? value.length > 0 && value.toLowerCase() !== list.dataset.email.toLowerCase()
            : null,
    };

    function update() {
        for (const item of list.querySelectorAll("li[data-rule]")) {
            const test = tests[item.dataset.rule];
            if (!test) continue;
            const met = test(field.value, Number(item.dataset.min || 1));
            item.toggleAttribute("data-met", met === true);
            const state = item.querySelector(".rs-rule-state");
            if (state) state.textContent = met === null ? "" : " " + (met ? list.dataset.labelMet : list.dataset.labelUnmet);
        }
    }

    if (list && field) {
        field.addEventListener("input", update);
        update();
    }
}

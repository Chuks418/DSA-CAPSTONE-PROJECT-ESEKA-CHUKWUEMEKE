/**
 * Creates a DOM element safely.
 *
 * @param {string} tag - HTML element name.
 * @param {object} props - Element properties, attributes and event handlers.
 * @param {string|number|Node|Array|null} children - Child content.
 * @returns {HTMLElement}
 */
export function el(tag, props = {}, children = []) {
  const element = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined) {
      continue;
    }

    if (key === "className") {
      element.className = value;
      continue;
    }

    if (key === "text") {
      element.textContent = String(value);
      continue;
    }

    if (key === "attrs") {
      for (const [attribute, attributeValue] of Object.entries(value)) {
        if (
          attributeValue === null ||
          attributeValue === undefined ||
          attributeValue === false
        ) {
          continue;
        }

        element.setAttribute(
          attribute,
          attributeValue === true ? "" : String(attributeValue)
        );
      }

      continue;
    }

    if (key.startsWith("on") && typeof value === "function") {
      element.addEventListener(key.slice(2).toLowerCase(), value);
      continue;
    }

    if (key in element && !key.startsWith("aria-") && !key.startsWith("data-")) {
      element[key] = value;
      continue;
    }

    if (typeof value === "boolean") {
      if (value) {
        element.setAttribute(key, "");
      }

      continue;
    }

    element.setAttribute(key, String(value));
  }

  appendChildren(element, children);

  return element;
}

/**
 * Appends text, DOM nodes or arrays of children to an element.
 *
 * @param {HTMLElement} parent
 * @param {string|number|Node|Array|null} children
 */
function appendChildren(parent, children) {
  if (children === null || children === undefined || children === false) {
    return;
  }

  if (Array.isArray(children)) {
    for (const child of children) {
      appendChildren(parent, child);
    }

    return;
  }

  if (
    typeof children === "string" ||
    typeof children === "number"
  ) {
    parent.appendChild(document.createTextNode(String(children)));
    return;
  }

  if (typeof children === "object" && typeof children.nodeType === "number") {
    parent.appendChild(children);
  }
}
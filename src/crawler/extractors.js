import { normalizeWhitespace } from "../utils/text.js";
import { extractCanonicalComponents } from "./canonicalExtractor.js";

export const extractCanonicalUiState = async (page, screenshotPath) => {
  const pageUrl = new URL(page.url()).pathname || "/";
  const title = await page.title().catch(() => "");
  const components = await page.evaluate(() => {
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    };

    const selectorFor = (element) => {
      if (element.id) return `#${CSS.escape(element.id)}`;
      const dataTest = element.getAttribute("data-testid") || element.getAttribute("data-test");
      if (dataTest) return `[data-testid="${dataTest}"]`;

      const parts = [];
      let current = element;
      while (current && current.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
        const tag = current.tagName.toLowerCase();
        const classes = [...current.classList].slice(0, 2).map((item) => `.${CSS.escape(item)}`).join("");
        const siblingIndex = [...current.parentElement?.children || []].filter((sibling) => sibling.tagName === current.tagName).indexOf(current) + 1;
        parts.unshift(`${tag}${classes}${siblingIndex > 1 ? `:nth-of-type(${siblingIndex})` : ""}`);
        current = current.parentElement;
      }
      return parts.join(" > ");
    };

    const roleOrType = (element) => {
      const role = element.getAttribute("role");
      if (role) return role;
      const tag = element.tagName.toLowerCase();
      if (tag === "a") return "navigation_item";
      if (tag === "button") return "button";
      if (["input", "textarea", "select"].includes(tag)) return "form_field";
      if (/^h[1-6]$/.test(tag)) return "heading";
      if (["p", "span", "li", "label"].includes(tag)) return "text_block";
      return tag;
    };

    const elements = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6,p,span,a,button,label,input,textarea,select,li,[role]")];
    return elements.filter(visible).slice(0, 350).map((element, index) => {
      const rect = element.getBoundingClientRect();
      const text = element.innerText || element.textContent || element.getAttribute("aria-label") || element.getAttribute("placeholder") || "";
      return {
        component_id: `component-${index + 1}`,
        component_type: roleOrType(element),
        component_selector: selectorFor(element),
        actual_text_content: text.replace(/\s+/g, " ").trim() || null,
        attributes: {
          href: element.getAttribute("href"),
          aria_label: element.getAttribute("aria-label"),
          placeholder: element.getAttribute("placeholder"),
          disabled: element.hasAttribute("disabled")
        },
        bounding_box: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      };
    });
  });

  return {
    page_url: pageUrl,
    full_url: page.url(),
    title: normalizeWhitespace(title),
    screenshot_path: screenshotPath,
    retrieved_at: new Date().toISOString(),
    components
  };
};

export { extractCanonicalComponents };

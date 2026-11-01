import { prepareSvg } from "./logo";

/** A logo SVG as an <img> source. */
export function svgUrl(svg: string) {
  const p = prepareSvg(svg);
  return p.ok && p.svg ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(p.svg) : "";
}

/** The logo recoloured to one colour (bitmap logos keep their own colours). `null` keeps the original. */
export function tinted(svg: string, color: string | null) {
  if (!color) return svgUrl(svg);
  const p = prepareSvg(svg);
  if (!p.ok || !p.svg) return "";
  const doc = new DOMParser().parseFromString(p.svg, "image/svg+xml");
  if (doc.querySelector("image")) return svgUrl(svg);
  doc.querySelectorAll("path, rect, circle, ellipse, polygon, polyline, line, g, svg").forEach((el) => {
    if (el.closest("mask")) return;
    if (el.getAttribute("fill") !== "none") el.setAttribute("fill", color);
    if (el.getAttribute("stroke") && el.getAttribute("stroke") !== "none") el.setAttribute("stroke", color);
    el.removeAttribute("style");
  });
  doc.querySelectorAll("style").forEach((s) => s.remove());
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(doc.documentElement));
}

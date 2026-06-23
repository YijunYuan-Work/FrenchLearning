export function scrollToPageTop() {
  window.requestAnimationFrame(() => {
    const scrollingElement = document.scrollingElement || document.documentElement;

    window.scrollTo({ left: 0, top: 0, behavior: "auto" });
    scrollingElement.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });
}

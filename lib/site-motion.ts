/** Reveal offscreen content once, keeping the page usable without animation support. */
export function enhanceSiteMotion(root: HTMLElement) {
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let observer: IntersectionObserver | undefined;
  const enhanced: HTMLElement[] = [];

  function reset() {
    observer?.disconnect();
    for (const element of enhanced) {
      element.classList.remove("doj-reveal", "doj-reveal-pending");
      element.style.removeProperty("--doj-reveal-delay");
    }
    enhanced.length = 0;
  }

  function prepare() {
    reset();
    if (preference.matches || !("IntersectionObserver" in window)) return;

    observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const element = entry.target as HTMLElement;
        element.classList.remove("doj-reveal-pending");
        element.dataset.dojRevealed = "true";
        observer?.unobserve(element);
      }
    }, { threshold: 0.08, rootMargin: "0px 0px -24px 0px" });

    const targets = root.querySelectorAll<HTMLElement>([
      ".doj-home-intro-heading > div", ".doj-home-comforts > div",
      ".doj-section-heading > *", ".doj-room-card",
      ".doj-experience-image", ".doj-experience-copy",
      ".doj-story-photo", ".doj-story-copy", ".doj-about-details > div",
      ".doj-gallery-grid > button", ".doj-contact > div",
      ".doj-page-cta > *", ".doj-footer-top > *",
    ].join(","));

    for (const element of targets) {
      // Never hide content the guest is already viewing or interacting with.
      if (element.dataset.dojRevealed || element.contains(document.activeElement)
        || element.getBoundingClientRect().top < window.innerHeight - 24) continue;
      const sibling = Array.from(element.parentElement?.children ?? []).indexOf(element);
      element.style.setProperty("--doj-reveal-delay", `${(sibling % 3) * 70}ms`);
      element.classList.add("doj-reveal", "doj-reveal-pending");
      enhanced.push(element);
      observer.observe(element);
    }
  }

  prepare();
  preference.addEventListener("change", prepare);
  return () => { preference.removeEventListener("change", prepare); reset(); };
}

export function scrollToHotelSection(id: string) {
  document.getElementById(id)?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
}

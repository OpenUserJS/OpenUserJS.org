function isElementInViewport(aEl) {
  var rect = null;

  if (aEl instanceof jQuery) {
    aEl = aEl[0];
  }

  rect = aEl.getBoundingClientRect();

  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) && // or $(window).height()
    rect.right <= (window.innerWidth || document.documentElement.clientWidth) // or $(window).width()
  );
}

// IE8+, Opera Presto, and older browser Element.Polyfill

if (window.Element && !Element.prototype.closest) {
  Element.prototype.closest =
  function(aSelector) {
    var matches = (this.document || this.ownerDocument).querySelectorAll(aSelector);
    var i;
    var el = this;

    do {
      i = matches.length;
      while (--i >= 0 && matches.item(i) !== el) {
      };
    } while ((i < 0) && (el = el.parentElement));

    return el;
  };
}

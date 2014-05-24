
exports.paginateTemplate = function(opts) {
  // Required
  var currentPage = opts.currentPage;
  var lastPage = opts.lastPage;
  var urlFn = opts.urlFn;

  // Optional
  var distVisible = opts.distVisible || 4;
  var firstVisible = opts.firstVisible || true;
  var lastVisible = opts.firstVisible || true;

  var linkedPages = [];

  for (var i = Math.max(1, currentPage - distVisible); i <= Math.min(currentPage + distVisible, lastPage); i++)
    linkedPages.push(i);

  if (firstVisible && linkedPages.length > 0 && linkedPages[0] != 1)
    linkedPages.splice(0, 0, 1); // insert the value 1 at index 0

  if (lastVisible && linkedPages.length > 0 && linkedPages[linkedPages.length-1] != lastPage)
    linkedPages.push(lastPage);


  var html = '';
  html += '<ul class="pagination">';
  for (var i = 0; i < linkedPages.length; i++) {
    var linkedPage = linkedPages[i];
    html += '<li';
    if (linkedPage == currentPage)
      html += ' class="active"';
    html += '>';
    html += '<a href="';
    html += urlFn(linkedPage);
    html += '">';
    html += linkedPage;
    html += '</a>';
    html += '</li>';
  }
  html += '</ul>';
  return html;
}

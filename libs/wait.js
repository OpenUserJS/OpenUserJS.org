// A simple way of waiting for a bunch of async calls to finish
// Call the constructor with the function you want run when everything is done
// Add functions that you want to wait to get called 
// Basically callbacks to async functions

// So instead of:
// asyncFunction(callback);

// Do:
// var wait = new Wait(function() { console.log('done'); });
// asyncFunction(wait.add(callback));

function Wait(last) {
  this.counter = 0;
  this.done = function() {
    if (this.counter) return;
    last();
  };
}

Wait.prototype.add = function(task) {
  ++this.counter;

  var wait = this;
  return (function() {
    task.apply(null, Array.prototype.slice.apply(arguments));
    --wait.counter;
    wait.done();
  });
}

exports.Wait = Wait;


module.exports = function(mongoose) {
  var collection = 'User';
  var Schema = mongoose.Schema;
  var ObjectId = Schema.ObjectId;

  var schema = new Schema({
    name: String,
    regdate: {type: Date, default: Date.now}
  });

  this.model = mongoose.model(collection, schema);

  return this;
};

'use strict';

var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var strategySchema = new Schema({
  id: String,
  key: String,
  name: String,
  display: String
});

var Strategy = mongoose.model('Strategy', strategySchema);

exports.Strategy = Strategy;

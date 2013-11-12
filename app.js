
var express = require('express');
var app = express();
var controllers = require('./controllers');
var mongoose = require('mongoose');
var config = require('./config.js')(app, express, controllers, mongoose);
var models = {};
models.user = require('./models/user')(mongoose.conn).model;

app.listen(process.env.port || 8080);

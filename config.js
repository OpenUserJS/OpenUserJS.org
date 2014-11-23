var config = {};

// Mongoose
config.mongoose = {};
var devDbMongooseUri = 'mongodb://nodejitsu_sizzlemctwizzle:b6vrl5hvkv2a3vvbaq1nor7fdl@ds045978.mongolab.com:45978/nodejitsu_sizzlemctwizzle_nodejitsudb8203815757';
config.mongoose.uri = process.env.CONNECT_STRING || devDbMongooseUri;

// Express
config.express = {};
config.express.sessionSecret = process.env.SESSION_SECRET || 'someSecretStringForSession';

// OpenUserJS: Urls
config.port = process.env.PORT || 8080;
config.host = process.env.HOST || (process.env.NODE_ENV === 'production' ? 'openuserjs.org' : 'localhost');
config.isHTTPS = config.port === 443;
config.rootUrl = (config.isHTTPS ? 'https' : 'http') + config.host;
if ((config.isHTTPS && config.port !== 443) || (!config.isHTTPS && config.port !== 80)) {
    config.rootUrl += ':' + config.port;
}
config.authCallbackBaseUrl = process.env.AUTH_CALLBACK_BASE_URL || config.rootUrl;

// OpenUserJS: Limits
config.maximumScriptSize = 1048576; // 1 Mb
config.maximumScriptDescriptionSize = 1048576; // 1 Mb
config.maximumRequestBodySize = Math.max(config.maximumScriptSize, config.maximumScriptDescriptionSize);

module.exports = config;

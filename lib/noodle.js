var fs       = require('fs'),
    util     = require('util'),
    async    = require('async'),
    request  = require('request'),
    cache    = require('./cache'),
    selector = require('./selector'),
    types    = {};


// Initialize config settings

exports.config = {
  cacheMaxTime:        60 * 60 * 1000,
  cachePurgeTime:      ((60 * 60 * 1000) * 24) * 7,
  cacheMaxSize:        124,
  defaultDocumentType: 'html'
};


// Initialize supported document types

fs.readdir('lib/types/', function (err, files) {
  files.forEach(function (file) {
    file = file.substr(0, file.lastIndexOf('.'));
    types[file] = require('./types/' + file);
  });
});


// Initialize the cache

cache.init();


// API entry point

exports.scrape = function (queries, callback) {
  var asyncTasks      = [],
      cachedIndices   = [],
      asArray         = false;

  // Normalise queries to an array incase only one query was 
  // sent to the server.
  //
  // Takes note if the client sent it as an array or not:
  // If it is an array sent the response back as an array

  if (util.isArray(queries)) {
    asArray = true;
  } else {
    queries = [queries];
  }

  // Scrape the queries based on their query type.
  // Order is ensured. See github.com/caolan/async/#parallel

  queries.forEach(function (query) {
    asyncTasks.push(function (callback) {

      query.type = query.type || exports.config.defaultDocumentType;

      // If query is cached complete this asyncTask early with 
      // that query result.

      if (cache.check(query)) {
        callback(null, cache.get(query));
        console.log('Came from cache');
        return false;
      }

      console.log('Didn\'t come from cache');

      // Differentiate the selection based of the query type
      //
      // Accept:
      //
      // - 'html' (defaults to this if no query type specified)
      // - 'json'

      function completeTask (err, result, cb) {
        if (err) {
          result = {
            results: [],
            error: err
          }
        } else {
          result = cache.put(query, result);
        }
        cb(null, result);
      }

      request(query.url, function (err, response, body) {
        if (!err && response.statusCode == 200) {

          if (types[query.type]) {
            types[query.type].select(body, query, function (err, result) {
              completeTask(err, result, callback);
            })
          } else {
            callback(null, {results: [], error: 'Query type not supported'});
          }

        } else {
          callback(null, {results: [], error: 'Page not found'});
        }
      });

    });
  });

  // Pass the scraped/cached queries back to response.
  //
  // This callback fires when all the aynchronousTask functions 
  // (above) have called back (marked as completed).
  //
  // Async.parallel ensures order.

  async.parallel(asyncTasks, function (err, results) {
    callback(null, (asArray) ? results : results[0]);
  });
};
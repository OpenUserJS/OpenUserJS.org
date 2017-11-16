'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//
var Remove = require('../models/remove').Remove;
var User = require('../models/user').User;
var async = require('async');

// Get the models for removable content that belongs to a user
var modelNames = ['Script', 'Comment', 'Discussion']; // TODO: , 'Group', 'Comment', 'Discussion', 'Flag', 'Vote' eventually
var models = {};

modelNames.forEach(function (aModelName) {
  models[aModelName] = require('../models/' +
    aModelName.toLowerCase())[aModelName];
});

// Determine whether content can be removed by a user.
function removeable(aModel, aContent, aUser, aCallback) {
  // The user must be logged in
  // The user is a moderator then the content must be flagged
  // If the user is an admin or greater then the content may be removed
  if (!aUser || (!aContent.flagged && aUser.role > 3) || aUser.role > 2) {
    return aCallback(false);
  }

  // You can't remove yourself
  // You can only remove a remove a user with a lesser role than yourself
  if (aModel.modelName === 'User') {
    return aCallback(aContent._id != aUser._id && aContent.role > aUser.role,
      aContent);
  }

  User.findOne({
    _id: aContent._authorId
  }, function (aErr, aAuthor) {
    // Content without an author shouldn't exist
    if (aErr || !aAuthor) {
      return aCallback(false);
    }

    // You can't remove your own content this way
    // When you remove your own content it's removed for good
    if (aAuthor._id == aUser._id) {
      return aCallback(false, aAuthor);
    }

    // You can only remove content by an author with a lesser user role
    aCallback(aAuthor.role > aUser.role, aAuthor);
  });
}
exports.removeable = removeable;

function remove(aModel, aContent, aUser, aReason, aAutomated, aCallback) {

  async.series([
    function (aOuterCallback) {

      // TODO: #126
      switch (aModel.modelName) {
        case 'User':
          // NOTE: Do nothing
          aOuterCallback(null);
          break;
        case 'Script':
          // TODO: Remove from any non-owned Groups and decrement that Group counter #93
          aOuterCallback(null);
          break;
        case 'Group':
          // TODO: Find all Scripts in it and do something #93
          aOuterCallback(null);
          break;
        case 'Comment':

          async.waterfall([
            // Find Discussion
            function (aInnerCallback) {

              models['Discussion'].findOne({
                _id: aContent._discussionId
              },
              function (aErr, aDiscussion) {

                if (aErr || !aDiscussion) {
                  aInnerCallback(null, null);
                  return;
                }

                aInnerCallback(null, aDiscussion);
              });

            },

            // Find if any newer comments
            function (aDiscussion, aInnerCallback) {
              var nextComment = null;

              if (!aDiscussion) {
                aInnerCallback(null, null, null);
                return;
              }

              models['Comment'].find({
                _discussionId: aDiscussion._id,
                created: { $gt: aContent.created }
              },
              null,
              {
                sort: 'created'
              },
              function (aErr, aComments) {

                if (aErr || !aComments) {
                  aInnerCallback(null, aDiscussion, null);
                  return;
                }

                if (aComments.length !== 0) {
                  nextComment = aComments[aComments.length - 1];
                }

                aInnerCallback(null, aDiscussion, nextComment);
              });

            },

            // Find if any older comments
            function (aDiscussion, aNextComment, aInnerCallback) {
              var prevComment = null;

              if (!aDiscussion) {
                aInnerCallback(null, null, null, null);
                return;
              }

              models['Comment'].find({
                _discussionId: aDiscussion._id,
                created: { $lt: aContent.created }
              },
              null,
              {
                sort: 'created'
              },
              function (aErr, aComments) {

                if (aErr || !aComments) {
                  aInnerCallback(null, aDiscussion, aNextComment, null);
                  return;
                }

                if (aComments.length !== 0) {
                  prevComment = aComments[aComments.length - 1];
                }

                aInnerCallback(null, aDiscussion, aNextComment, prevComment);
              });

            },

            // Find if any same comments
            function (aDiscussion, aNextComment, aPrevComment, aInnerCallback) {

              if (!aDiscussion) {
                console.warn('No discussion found for removal reparse');
                aInnerCallback('Removal reparse failure', {
                  discussion: null,
                  nextComment: null,
                  prevComment: null
                });
                return;
              }

              models['Comment'].find({
                _discussionId: aDiscussion._id,
                created: { $eq: aContent.created }
              },
              null,
              {
                sort: 'created'
              },
              function (aErr, aComments) {

                if (aErr || !aComments) {
                  console.warn('No comment with same creation date found for removal reparse');
                  aInnerCallback('Removal reparse failure', {
                    discussion: aDiscussion,
                    nextComment: aNextComment,
                    prevComment: aPrevComment
                  });
                  return;
                }

                if (aComments.length === 1) {
                  aInnerCallback(null, {
                    discussion: aDiscussion,
                    nextComment: aNextComment,
                    prevComment: aPrevComment
                  });

                } else {

                  // TODO: Something fancy for figuring out what aPrevComment should be

                  console.error('Too many comments with same creation date for removal reparse',
                    aComments.length);
                  aInnerCallback('Removal reparse failure', {
                    discussion: aDiscussion,
                    nextComment: aNextComment,
                    prevComment: aPrevComment
                  });
                }

              });

            }
          ],
          function (aErr, aResult) {

            if (aErr || !aResult.discussion) {
              aOuterCallback(aErr);
              return;
            }

            if (aResult.nextComment) {
              --aResult.discussion.comments;

              aResult.discussion.save(function (aErr) {
                aOuterCallback(null);
              });

            } else if (aResult.prevComment) {
              --aResult.discussion.comments;
              aResult.discussion.lastCommentor = aResult.prevComment.author;
              aResult.discussion.updated = aResult.prevComment.created;

              aResult.discussion.save(function (aErr) {
                aOuterCallback(null);
              });
            } else {
              aOuterCallback(null);
            }

          });
          break;
        case 'Discussion':
          // TODO: Find all Comments in it and
          //       possibly do something with non-owned which get orphaned
          aOuterCallback(null);
          break;
        case 'Flag':
          // TODO: Recalculate affected scripts (and any other model) with `.flags`
          aOuterCallback(null);
          break;
        case 'Vote':
          // TODO: Recalculate affected scripts (and any other model) with `.votes`
          aOuterCallback(null);
          break;
        default:
          console.error('Unknown Model not covered in remove:', aModel.modelName);
          aOuterCallback(null);
      }
    }
  ],
  function (aErr, aResults) {

    if (aErr) {
      console.warn(aErr, aContent._id);
    }

    var removeModel = new Remove({
      'model': aModel.modelName,
      'content': aContent.toObject(),
      'removed': new Date(),
      'reason': aReason,
      'removerName': aUser.name,
      'removerRole': aUser.role,
      'removerAutomated': aAutomated,
      '_removerId': aUser._id
    });

    removeModel.save(function (aErr, aRemove) {
      if (aErr || !aRemove) {
        console.error('Failed to save to the Graveyard', aModel.modelName, aContent._id);
        aCallback(aErr);
        return;
      }

      aContent.remove(function (aErr) {
        if (aErr) {
          console.error('Failed to remove', aModel.modelName, aContent._id);
          aCallback(aErr); // NOTE: Same as `true` but specific e.g. stop all removal(s)
          return;
        }

        if (aModel.modelName === 'User') {
          aCallback(true); // NOTE: Stop any series removals and done
        } else {
          aCallback(null); // NOTE: Continue any series and non-User single removals
        }
      });
    });


  });

}

exports.remove = function (aModel, aContent, aUser, aReason, aCallback) {
  removeable(aModel, aContent, aUser, function (aCanRemove, aAuthor) {
    if (!aCanRemove) {
      aCallback(false);
      return;
    }

    if (aModel.modelName !== 'User') {
      remove(aModel, aContent, aUser, aReason, false, function (aErr) {
        if (aErr) {
          console.warn('Failed to remove', aModel.modelName, '\n', aErr);
          aCallback(false);
          return;
        }

        aCallback(true);
      });
    } else {
      // Remove all the user's content
      async.eachSeries(modelNames, function (aModelName, aEachOuterCallback) {
        var model = models[aModelName];
        model.find({
          _authorId: aContent._id
        },
          function (aErr, aContentArr) {
            async.eachSeries(aContentArr, function (aContent, aEachInnerCallback) {
              remove(model, aContent, aUser, '', true, aEachInnerCallback);
            }, aEachOuterCallback);
          });
      }, function () {
        remove(aModel, aContent, aUser, aReason, false, aCallback);
      });
    }
  });
};

// This function is similar to findOne but expands
// the search to removed content
// You pass it the model of the content, the search query,
// the user making the query (or boolean true for internal usage),
// and a callback function with parameters (alive, content, removed)
//
// Alive can be true, false, or null. Alive is true if the content
// was found and wasn't removed. It's false if the content exists but
// was removed, and null if the content doesn't exist.
//
// The content parameter is what you get via the findOne callback even
// if the content is removed (it gets temporarily resurrected).
// You might get null back if the user doesn't have proper permissions.
//
// The removed parameter is the Remove document containing the content
// and is always returned if found, regardless of permissions.
exports.findDeadorAlive = function (aModel, aQuery, aUser, aCallback) {
  var modelName = aModel.modelName;

  aModel.findOne(aQuery, function (aErr, aContent) {
    var name = null;
    var rmQuery = { model: modelName };

    if (!aErr && aContent) {
      return aCallback(true, aContent, null);
    }

    if (modelName !== 'User' && -1 === modelNames.indexOf(modelName)) {
      return aCallback(null, null, null);
    }

    for (name in aQuery) {
      rmQuery['content.' + name] = aQuery[name];
    }

    Remove.findOne(rmQuery, function (aErr, aRemoved) {
      if (aErr || !aRemoved) {
        return aCallback(null, null, null);
      }

      if (!aUser || (aUser !== true && aUser.role > aRemoved.removerRole)) {
        return aCallback(false, null, aRemoved);
      }

      aCallback(false, new aModel(aRemoved.content), aRemoved);
    });
  });
};

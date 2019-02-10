'use strict';

// Define some pseudo module globals
var isPro = require('../libs/debug').isPro;
var isDev = require('../libs/debug').isDev;
var isDbg = require('../libs/debug').isDbg;

//--- Model inclusions
var User = require('../models/user').User;
var Vote = require('../models/vote').Vote;
var Script = require('../models/script').Script;

//--- Library inclusions
var flagLib = require('../libs/flag');

//---

// Determine whether content can be voted by a user.
function voteable(aScript, aUser, aCallback) {
  // No script
  if (!aScript) {
    aCallback(false);
    return;
  }
  // Not logged in
  if (!aUser) {
    aCallback(false);
    return;
  }

  getAuthor(aScript, function (aAuthor) {
    // Script without an author shouldn't exist
    if (!aAuthor) {
      aCallback(false);
      return;
    }

    // You can't vote on your own Script
    if (aAuthor._id == aUser._id) {
      aCallback(false);
      return;
    }

    // Always try to get a Vote
    getVote(aScript, aUser, function (aVote) {
      aCallback(true, aAuthor, aVote);
      return;
    });
  });
}
exports.voteable = voteable;

function getVote(aScript, aUser, aCallback) {
  Vote.findOne({
    '_scriptId': aScript._id,
    '_userId': aUser._id
  }, function (aErr, aVote) {
    if (aErr) {
      console.error('DB: getVote failure. aErr :=', aErr);
      // fallthrough
    }

    aCallback(aErr || (!aVote ? null : aVote));
  });
}

function getAuthor(aScript, aCallback) {
  User.findOne({ _id: aScript._authorId }, function (aErr, aAuthor) {
    // Script without an author shouldn't exist
    if (aErr) {
      console.error('DB: getAuthor failure. aErr :=', aErr);
      aCallback(null);
      return;
    }
    if (!aAuthor) {
      console.error('DB: Script has no Author', aScript._id);
      aCallback(null);
      return;
    }

    aCallback(aAuthor);
  });
}
exports.getAuthor = getAuthor;


function saveScript(aScript, aAuthor, aFlags, aCallback) {
  if (!aScript) {
    aCallback(false);
    return;
  }

  if (!aFlags) {
    aScript.save(function (aErr, aScript) {
      if (aErr) {
        console.error('DB: saveScript failure. aErr :=', aErr);
        aCallback('DB: saveScript failed to save flags in voteLib');
        return;
      }

      if (!aScript) {
        console.error('DB: saveScript failure with no Script');
        aCallback('DB: saveScript failed to save flags in voteLib with no Script');
        return;
      }

      aCallback(null);
      return;
    });
    return;
  }

  flagLib.saveContent(Script, aScript, aAuthor, aFlags, false, function (aFlagged) {
    aCallback(null);
  });
}
exports.saveScript = saveScript;

function newVote(aScript, aUser, aAuthor, aCasting, aCallback) {
  var vote = new Vote({
    vote: aCasting,
    _scriptId: aScript._id,
    _userId: aUser._id
  });

  vote.save(function (aErr, aNewVote) {
    var flags = null;

    if (aErr) {
      console.error('DB: Failed to save new Vote', aErr);
      aCallback(false);
      return;
    }

    if (!aNewVote) {
      console.error('DB: New vote not saved. aScript._id :=', aScript._id);
      aCallback(false);
      return;
    }

    aScript.rating += (aCasting ? 1 : -1);
    aScript.votes = aScript.votes + (aCasting ? 1 : -1);
    if (aCasting) {
      flags = -1;
    }

    saveScript(aScript, aAuthor, flags, aCallback);
  });
}

exports.unvote = function (aScript, aUser, aCallback) {
  voteable(aScript, aUser, function (aCanVote, aAuthor, aVote) {
    var votes = null;
    var flags = null;
    var casted = null;

    if (!aCanVote || !aVote) {
      aCallback(false);
      return;
    }
    if (!aScript.rating) {
      aScript.rating = 0;
    }

    if (!aScript.votes) {
      aScript.votes = 0;
    }

    votes = aScript.votes;
    flags = 0;
    casted = aVote.vote;

    aVote.remove(function (aErr, aRemovedVote) {
      if (aErr) {
        console.error('DB: Vote removal failure aErr :=', aErr);
        aCallback(false);
        return;
      }

      if (!aRemovedVote) {
        console.error('DB: Nothing removed for Vote. aScript._id :=', aScript._id);
        aCallback(false);
        return;
      }

      aScript.rating += (casted ? -1 : 1);
      aScript.votes = (votes <= 0 ? 0 : votes - 1);
      if (casted) {
        flags = 1;
      }

      saveScript(aScript, aAuthor, flags, aCallback);
    });

  });
}

function vote(aCasting, aScript, aUser, aCallback) {
  voteable(aScript, aUser, function (aCanVote, aAuthor, aVote) {
    var votes = null;
    var flags = 0;

    if (!aCanVote) {
      aCallback(false);
      return;
    }

    if (!aScript.rating) {
      aScript.rating = 0;
    }

    if (!aScript.votes) {
      aScript.votes = 0;
    }

    votes = aScript.votes;

    if (aVote) {
      if (aVote.vote !== aCasting) {
        aVote.vote = aCasting;
        aScript.rating += (aCasting ? 2 : -2);
        aScript.votes = aScript.votes + (aCasting ? 2 : -2);
        flags = aCasting ? -1 : 1;

      }

      aVote.save(function (aErr, aSavedVote) {
        if (aErr) {
          console.error('DB: Vote saving failure aErr :=', aErr);
          aCallback(false);
          return;
        }

        if (!aSavedVote) {
          console.error('DB: Nothing saved for Vote. aScript._id :=', aScript._id);
          return;
        }

        saveScript(aScript, aAuthor, flags, aCallback);
      });

    } else {
      newVote(aScript, aUser, aAuthor, aCasting, aCallback);
    }

  });
}

exports.upvote = function (aScript, aUser, aCallback) {
  vote(true, aScript, aUser, aCallback);
}

exports.downvote = function (aScript, aUser, aCallback) {
  vote(false, aScript, aUser, aCallback);
}


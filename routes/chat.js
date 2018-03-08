var express = require('express');
var router = express.Router();

var db = require('../models/database.js');
const gf = require('../utils/generator_functions');


//opens no specific chat
router.get('/chat', function(req, res, next) {
  res.render('messenger', {userNotLoggedIn: !req.session.user})
})

//opens an actual chat
router.get('/chat/:id', function(req, res, next) {
  var callback = function(err, chats) {
    if (err) {
      next(err);
    } else {
      var has_no_chats = true;
      console.log("chats: ", chats);

      if (chats) {
        for (var chat of chats) {
          console.log("Chat: ", chat.value);
          var prsd = JSON.parse(chat.value);
          console.log("chats info: ", prsd.to, req.params.id, typeof prsd.to, typeof req.params.id, prsd.to === req.params.id)
          if (prsd.to === req.params.id || chat.key === req.params.id) {
            has_no_chats = false;
          }
        }
      }

      if (!chats || has_no_chats) {
        var add_chat_callback = function(err, data) {
          if (err) {
            res.status(400).send("Error adding chat: " + err);
          } else {
            var add_chat_second_callback = function(err, data) {
              console.log("ChatId1: ", chatId);
              res.render('messenger', {userNotLoggedIn: !req.session.user, 'messages': [], 'user': req.session.user, 'recipient': req.params.id, 'chatId': chatId});
            }

            db.add_key_value('chats', req.params.id, JSON.stringify({
              'to': req.session.user,
              'chatId': chatId
            }), add_chat_second_callback);
          }
        }

        var chatId = gf.generate_post_id();
        db.add_key_value('chats', req.session.user, JSON.stringify({
          'to': req.params.id,
          'chatId': chatId
        }), add_chat_callback);
      } else {
        var chat_id_callback = function(err, data) {
          if (err) {
            res.status(400).send(err);
          } else {
            var chatId;
            console.log('data', data);
            if(!data) {data = []};
            for (var chat of data) {
              var prsd = JSON.parse(chat.value);
              if (prsd.to === req.params.id || chat.key === req.params.id) {
                chatId = prsd.chatId;
              }
            }

            var messages_callback = function(err, data) {
              if (err) {
                res.status(400).send("Error getting messages: " + err);
              } else if (!data) {
                console.log("ChatId2: ", chatId);
                res.render('messenger', {userNotLoggedIn: !req.session.user, 'messages': [], 'user': req.session.user, 'recipient': req.params.id, 'chatId': chatId});
              } else {
                console.log("data before sort: ", data);
                data.sort(function(a, b) {
                  var prsdA = JSON.parse(a.value);
                  var prsdB = JSON.parse(b.value);
                  var dateA = new Date(prsdA.timeStamp);
                  var dateB = new Date(prsdB.timeStamp);
                  if (dateA > dateB) {
                    return 1;
                  } else if (dateB > dateA) {
                    return -1;
                  } else {
                    return 0;
                  }
                })

                //flatten each message
                for (var message of data) {
                  var prsd = JSON.parse(message.value);
                  message['from'] = prsd.from;
                  message['to'] = prsd.to;
                  message['content'] = prsd.content;
                  message['chatId'] = prsd.chatId;
                  message['timeStamp'] = prsd.timeStamp;
                }
                res.render('messenger', {userNotLoggedIn: !req.session.user, 'messages': data, 'user': req.session.user, 'recipient': req.params.id, 'chatId': chatId});
              }
            }

            db.lookup('messages', chatId, messages_callback);
          }
        }

        db.lookup('chats', req.session.user, chat_id_callback)
      }
    }
  };

  var userToSearch = req.session.user > req.params.id ? req.session.user : req.params.id;
  db.lookup('chats', userToSearch, callback);
})

// creating a message
router.post('/message', function(req, res, next) {
  var callback = function(err, data) {
    if (err) {
      res.status(400).send("Error saving message: " + err);
    } else {
      res.status(200).send("Message saved successfully");
    }
  }

  var from = req.body.from;
  var to = req.body.to;
  var content = req.body.content;
  var chatId = req.body.chatId;

  var messageObj = {
    'from': from,
    'to': to,
    'content': content,
    'chatId': chatId,
    'timeStamp': Date.now()
  };
  db.add_key_value('messages', chatId, JSON.stringify(messageObj), callback);
});

// getting a groupchat
router.get('/groupchat/:id', function(req, res, next) {
  res.render('groupchat', {userNotLoggedIn: !req.session.user});
})

// getting all messagesfor a specific chat id
router.get('/messages', function(req, res, next) {
  var callback = function(err, data) {
    if (err) {
      res.status(400).send("Error retrieving messages: " + err);
    } else {
      res.json({'messages': data});
    }
  }
  var chatId = req.body.chatId;
  db.lookup('messages', chatId, callback);
})


module.exports = router;

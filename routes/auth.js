var express = require('express');
var router = express.Router();
var sha256 = require('js-sha256');
var shorthash = require('shorthash');
var db = require('../models/database.js');

var fs = require('fs');

//signup route
router.get('/signup', function(req, res, next) {
  res.render('signup', { userNotLoggedIn: !req.session.user});
})

//login route
router.get('/login', function(req, res, next) {
	res.render('login', { userNotLoggedIn: !req.session.user });
})

//creating an account route
router.post('/createaccount', function(req, res, next) {
	var fullname = req.body.fullname;
	var username = req.body.username;
	var id = shorthash.unique(username);
	var password = sha256(req.body.password);
	db.add_user(username, id, password, fullname, function(data, err) {
		if (err) res.render('signup', { userNotLoggedIn: !req.session.user, message: "Error signing up."});
		else if (data) {
			req.session.user = username;
      req.session.fullname = fullname;
			res.redirect('/feed');
		} else {
			res.render('signup', {userNotLoggedIn: !req.session.user, message: 'Signup not valid. User already exists.'});
		}
	});
});

//check login route
router.post('/checklogin', function(req, res, next) {
	var username = req.body.username;
	var password = sha256(req.body.password);
	db.lookup('users', username, function(err, data) {
		if (err) res.render('login', { userNotLoggedIn: !req.session.user, message: 'Error occurred.' });
		else if (data) {
			var pswd = JSON.parse(data[0]["value"]);
			if (pswd.password == password) {
        req.session.user = username;
        req.session.fullname = pswd.fullname;
        req.session.save(function(err) {
          res.redirect('/feed');
        })
			} else {
				res.render('login', { userNotLoggedIn: !req.session.user, message: 'Incorrect password or username.'});
			}
		} else {
			res.render('login', { userNotLoggedIn: !req.session.user, message: 'Incorrect password or username.'});
		}
	});
});


// middleware to bounce unlogged in users
router.use(function(req, res, next) {
  if (!req.session.user) {
    console.log("req.user", req.session.user)
    res.redirect('/login');
  } else {
    next();
  }
})

module.exports = router;

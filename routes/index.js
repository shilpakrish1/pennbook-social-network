var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { userNotLoggedIn: !req.session.user });
});

router.get('/about', function(req, res, next) {
  res.render('about', {userNotLoggedIn: !req.session.user});
})


module.exports = router;

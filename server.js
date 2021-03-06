//load packages
var express = require('express');
var bodyParser = require('body-parser');
var passport = require('passport');
var authJwtController = require('./auth_jwt');
var User = require('./Users');
var Movie = require('./Movies');
var Review = require('./Reviews');
var jwt = require('jsonwebtoken');
var dotenv = require('dotenv').config();
var async = require('async');
const crypto = require("crypto");
var rp = require('request-promise');
var port = process.env.PORT || 8080;

const GA_TRACKING_ID = process.env.GA_KEY;

//create application
var app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(passport.initialize());

//initialize router
var router = express.Router();

router.use(function(req, res, next) {
    console.log(req.method, req.url);
    next();
});

//===============================================================================================
// routes
//===============================================================================================
// /postjwt route
router.route('/postjwt')
    .post(authJwtController.isAuthenticated, function (req, res) {
            console.log(req.body);
            res = res.status(200);
            if (req.get('Content-Type')) {
                console.log("Content-Type: " + req.get('Content-Type'));
                res = res.type(req.get('Content-Type'));
            }
            res.send(req.body);
        }
    );
//===============================================================================================
// /users/:userID route
router.route('/users/:userId')
    .get(authJwtController.isAuthenticated, function (req, res) {
        var id = req.params.userId;
        User.findById(id, function(err, user) {
            if (err) res.send(err);

            var userJson = JSON.stringify(user);
            // return that user
            res.json(user);
        });
    });
//===============================================================================================
// /users route
router.route('/users')
    .get(authJwtController.isAuthenticated, function (req, res) {
        User.find(function (err, users) {
            if (err) res.send(err);
            // return the users
            res.json(users);
        });
    });
//===============================================================================================
// /signup route
router.post('/signup', function(req, res) {
            if (!req.body.username || !req.body.password) {
            res.json({success: false, msg: 'Please pass username and password.'});
            }
            else {
            var user = new User();
            user.name = req.body.name;
            user.username = req.body.username;
            user.password = req.body.password;

            // save
            user.save(function(err) {
                      if (err) {
                      // duplicate entry
                      if (err.code == 11000)
                      return res.json({ success: false, message: 'A user with that username already exists.'});
                      else
                      return res.send(err);
                      }
                      res.json({ message: 'User created! Welcome ' + req.body.name + '!' });
                      });
            }
            });
//===============================================================================================
// /signin route
router.post('/signin', function(req, res) {
    var userNew = new User();
    userNew.name = req.body.name;
    userNew.username = req.body.username;
    userNew.password = req.body.password;

    User.findOne({ username: userNew.username }).select('name username password').exec(function(err, user) {
        if (err) res.send(err);

        user.comparePassword(userNew.password, function(isMatch){
            if (isMatch) {
                var userToken = {id: user._id, username: user.username};
                var token = jwt.sign(userToken, process.env.SECRET_KEY);
                res.json({success: true, token: 'JWT ' + token});
            }
            else {
                res.status(401).send({success: false, msg: 'Authentication failed. Wrong password.'});
            }
        });


    });
});
//===============================================================================================
// /movies route
router.route('/movies/:movieId')
    //get single movie
    .get(authJwtController.isAuthenticated, function (req, res) {
        console.log("Finding a movie by id...");
        var id = req.params.movieId;
        // var reviewsQuery = req.query.reviews;

        Movie.findById(id, function (err, movie) {
            if (err) res.send(err);

            if (req.query.reviews === 'true') {
                Review.find(function (err, reviews) {
                    if (err) res.send(err);

                    //find matching reviews for movie
                    Review.find({ movietitle: movie.title }).exec(function (err, reviews) {
                        if (err) res.send(err);
                        res.json({
                            movie: movie,
                            reviews: reviews
                        });
                    });
                });
            } else {
                //return movie don't return reviews
                res.json(movie);
            }
        });
    });

router.route('/movies')
    //get movies
    .get(authJwtController.isAuthenticated, function (req, res) {
        console.log("Getting all movies and reviews");
        //get all movies and reviews
        if (req.query.reviews === 'true') {
            console.log("Getting all movies with reviews");
            Movie.aggregate([
                {
                    $lookup: {
                        from: "reviews",
                        localField: "title",
                        foreignField: "movietitle",
                        as: 'reviews'
                    }
                }
            ], function (err, result) {
                if (err) {
                    res.send(err);
                }
                else res.send(result);
            });
        } else {
            //movies without reviews
            Movie.find(function (err, movies) {
                
                if (err) res.send(err);
                
                // return movies
                res.json(movies);
                });
        }
    })

    // create a new movie
.post(authJwtController.isAuthenticated, function (req, res) {
    if (!req.body.title) {
      res.json({ success: false, message: 'You have entered the movie information incorrectly. You where missing the title.' });
    }
    else if(!req.body.year){
      res.json({ success: false, message: 'You have entered the movie information incorrectly. You where missing the year.' });
    }else if(!req.body.genre){
      res.json({ success: false, message: 'You have entered the movie information incorrectly. You where missing the genre.' });
    }else if(!req.body.actors){
      res.json({ success: false, message: 'You have entered the movie information incorrectly. You where missing at least one actor.' });
    }
    else if (req.body.actors.length <= 2) {
    res.json({ success: false, message: 'Please add at atleast three actors to the movie.' })
    }
    else {

    var movie = new Movie();
    
    // set inputs to movie data
    movie.title = req.body.title;
    movie.year = req.body.year;
    movie.genre = req.body.genre;
    movie.actors = req.body.actors;
    
    // save
    movie.save(function(err) {
               if (err) {
               //d uplicate entry
               if (err.code === 11000)
               return res.json({ success: false, message: req.body.title + ' already exists in the database!' });
               else
               return res.send(err);
               }
               res.json({ message: req.body.title +  ' has been created & added to the database.' });
               });
    }
    })

// update a movie
.put(authJwtController.isAuthenticated, function (req, res) {
    Movie.findById(req.body._id,function (err, movie) {
                   if (err) {
                   res.send(err);
                   }
                   else if (!req.body.title) {
                       res.json({ success: false, message: 'You have entered the movie information incorrectly. You where missing the title.' });
                     }
                   else if(!req.body.year){
                       res.json({ success: false, message: 'You have entered the movie information incorrectly. You where missing the year.' });
                   }else if(!req.body.genre){
                       res.json({ success: false, message: 'You have entered the movie information incorrectly. You where missing the genre.' });
                   }else if(!req.body.actors){
                       res.json({ success: false, message: 'You have entered the movie information incorrectly. You where missing at least one actor.' });
                   }
                   else if (req.body.actors.length <= 2)
                   {
                   res.json({ success: false, message: 'Please add at atleast three actors to the movie.' });
                   }
                   else {
                   movie.title = req.body.title;
                   movie.year = req.body.year;
                   movie.genre = req.body.genre;
                   movie.actors = req.body.actors;
                   
                   movie.save(function(err) {
                              if (err) {
                              // duplicate entry
                              if (err.code === 11000)
                              return res.json({ success: false, message: req.body.title + ' already exists in the database!' });
                              else
                              return res.send(err);
                              }
                              res.json({ message: req.body.title +  ' has been updated!' });
                              });
                   }
                   });
    })
// delete a movie
.delete(authJwtController.isAuthenticated, function (req, res) {
    Movie.findByIdAndRemove(req.body._id,function (err, movie) {
        if (err) res.send(err);
                            
        res.json({ message: req.body.title + ' has been deleted from the database!'});
        });
    });

//===============================================================================================
// /reviews route
router.route('/reviews')
    //create review
    .post(authJwtController.isAuthenticated, function (req, res) {
        console.log("headers:", req.headers);
        console.log("body:", req.body);
        var movietitle = req.body.movietitle;

        Movie.findOne({ title: movietitle }, function (err, movie) {
            if (err) res.send(err);
            if(!req.body.movietitle){
                res.json({message: 'Review did not contain a movie name! You need to input the name of the movie you want to review!'})
            }
            if (!movie) {
                res.json({ success: false, msg: req.body.movietitle +  ' does not exist. Please select a movie that exists in the database to submit a review.' })
            }
            else {
                var authorizationToken = req.headers.authorization.split(' ')[1];
                var decoded = jwt.decode(authorizationToken, process.env.SECRET_KEY);

                //create the new review
                var newReview = new Review();
                newReview.username = decoded.username;
                newReview.movietitle = req.body.movietitle;
                newReview.review = req.body.review;
                newReview.rating = req.body.rating;
                if(!req.body.rating){
                    res.json({message: 'You forgot the rating! Please submit a review between 1 & 5!'})
                }
                else if(req.body.rating > 5){
                    res.json({message: 'Review rating too high! Rating needs to be between 1 & 5!'})
                }
                else if(req.body.rating <= 0){
                    res.json({message: 'Review rating too low! Rating needs to be between 1 & 5!'})
                }
                else if(!req.body.review){
                    res.json({message: 'You forgot to write a review!'})
                }
                else{
                    newReview.save(function(err) {
                        if (err) res.send(err);
                        res.json({ message: 'Review submitted for ' + req.body.movietitle + '!' })
                    });
                }

            }
        });
    })

    //get all reviews
    .get(authJwtController.isAuthenticated, function (req, res) {
        Review.find(function (err, reviews) {
            if (err) res.send(err);
            //return the users
            res.json(reviews);
        });
    })

    //delete one review
    .delete(authJwtController.isAuthenticated, function (req, res) {
        Review.findByIdAndRemove(req.body._id,function (err, reviews) {
            if (err) res.send(err);

            res.json({ message: 'Review deleted!'});
        });
    });

app.use('/', router);
app.listen(port);
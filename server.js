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
var cors = require('cors'); //connect to assignment 5 frontend

const GA_TRACKING_ID = process.env.GA_KEY;

//create server app
var app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(passport.initialize());
app.use(cors());

//create router
var router = express.Router();

//route middleware that will happen on every request
router.use(function(req, res, next) {
    //log each request to the console
    console.log(req.method, req.url);

    //continue doing what we were doing and go to the route
    next();
});

//-----------------------------server routes-----------------------------
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

//show user by id
router.route('/users/:userId')
    .get(authJwtController.isAuthenticated, function (req, res) {
        var id = req.params.userId;
        User.findById(id, function(err, user) {
            if (err) res.send(err);

            var userJson = JSON.stringify(user);

            //return that user
            res.json(user);
        });
    });

//get all users
router.route('/users')
    .get(authJwtController.isAuthenticated, function (req, res) {
        User.find(function (err, users) {
            if (err) res.send(err);

            //return the users
            res.json(users);
        });
    });

//-----------------------------signup and signin-----------------------------
router.post('/signup', function(req, res) {
    if (!req.body.username || !req.body.password || !req.body.password) {
        res.json({ success: false, message: 'Please pass name, username, and password.' });
    }
    else {
        var user = new User(req.body);

        // save the user
        user.save(function(err) {
            if (err) {
                // duplicate entry
                if (err.code === 11000)
                    return res.status(401).send({ success: false, message: 'A user with that username already exists.' });
                else
                    return res.send(err);
            }

            res.json({ message: 'User created!' });
        });
    }
});

router.post('/signin', function(req, res) {
    var userNew = new User(req.body);

    User.findOne({ username: userNew.username }).select('name username password').exec(function(err, user) {
        if (err) res.send(err);

        user.comparePassword(userNew.password, function(isMatch){
            if (isMatch) {
                var userToken = {id: user._id, username: user.username};
                var token = jwt.sign(userToken, process.env.SECRET_KEY);
                res.json({ success: true, token: 'JWT ' + token });
            }
            else {
                res.status(401).send({ success: false, msg: 'Authentication failed. Wrong password.' });
            }
        });


    });
});

//-----------------------------movies CRUD-----------------------------

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
            //just get all movies
            console.log("Getting movies without reviews")
            Movie.find(function (err, movies) {
                //if error, send error
                if (err) res.send(err);
                //return movies
                res.json(movies);
            });
        }
    })

    //create a new movie
    .post(authJwtController.isAuthenticated, function (req, res) {
        console.log("Saving a movie...");
        if (!req.body.title
            || !req.body.year
            || !req.body.genre
            || !req.body.actors
        ) {
            res.json({ success: false, message: 'Movie information is incorrect. Please include title, year, genre and actors.' });
        }
        else {
            //create new movie object
            var movie = new Movie(req.body);

            //save the movie object
            movie.save(function(err) {
                if (err) {
                    //duplicate entry
                    if (err.code === 11000)
                        return res.json({ success: false, message: 'A movie with that title already exists.' });
                    else
                        return res.send(err);
                }
                res.json({ message: 'Movie created!' });
            });
        }
    })

    //update a movie
    .put(authJwtController.isAuthenticated, function (req, res) {
        Movie.findById(req.body._id,function (err, movie) {
            if (err) {
                res.send(err);
            }
            else if (!req.body.title || !req.body.year || !req.body.genre || !req.body.actors) {
                res.json({ success: false, message: 'Movie information is incorrect. Please include title, year, genre and actors.' });
            }
            else if (req.body.actors.length < 3)
            {
                res.json({ success: false, message: 'Please include at least three actors(actor name, character name).' });
            }
            else {
                movie.title = req.body.title;
                movie.year = req.body.year;
                movie.genre = req.body.genre;
                movie.actors = req.body.actors;
                movie.imageUrl = req.body.imageUrl;

                movie.save(function(err) {
                    if (err) {
                        // duplicate entry
                        if (err.code === 11000)
                            return res.json({ success: false, message: 'A movie with that title already exists.' });
                        else
                            return res.send(err);
                    }
                    res.json({ message: 'Movie Updated!' });
                });
            }
        });
    })

    //delete a movie
    .delete(authJwtController.isAuthenticated, function (req, res) {
        Movie.findByIdAndRemove(req.body._id,function (err, movie) {
            if (err) res.send(err);

            res.json({ message: 'Movie Deleted!' });
        });
    });

//-----------------------------reviews CRUD-----------------------------
router.route('/reviews')
    //create review
    .post(authJwtController.isAuthenticated, function (req, res) {
        console.log("headers:", req.headers);
        console.log("body:", req.body);
        var movietitle = req.body.movietitle;

        Movie.findOne({ title: movietitle }, function (err, movie) {
            if (err) res.send(err);
            if (!movie) {
                res.json({ success: false, msg: 'No movie found.' })
            }
            else {
                //added to replace jwt decode
                // var username = req.username;

                //decode jwt authorization for username
                var authorizationToken = req.headers.authorization.split(' ')[1];
                var decoded = jwt.decode(authorizationToken, process.env.SECRET_KEY);

                //create the new review
                var newReview = new Review();
                newReview.username = decoded.username;
                newReview.movietitle = req.body.movietitle;
                newReview.review = req.body.review;
                newReview.rating = req.body.rating;

                newReview.save(function(err) {
                    if (err) res.send(err);
                    res.json({ message: 'Review submitted!' })
                });
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

            res.json({ message: 'Review Deleted!' });
        });
    });

//-----------------------------google analytics-----------------------------
function trackDimension(category, action, label, value, dimension1, metric1) {

    var options = { method: 'GET',
        url: 'https://www.google-analytics.com/collect',
        qs:
            {   // API Version.
                v: '1',
                // Tracking ID / Property ID.
                tid: GA_TRACKING_ID,
                // Random Client Identifier. Ideally, this should be a UUID that
                // is associated with particular user, device, or browser instance.
                cid: crypto.randomBytes(16).toString("hex"),
                // Event hit type.
                t: 'event',
                // Event category.
                ec: category,
                // Event action.
                ea: action,
                // Event label.
                el: label,
                // Event value.
                ev: value,
                // Custom Dimension
                cd1: dimension1,
                // Custom Metric
                cm1: metric1
            },
        headers:
            {  'Cache-Control': 'no-cache' } };

    return rp(options);
}

router.route('/test')
    .get(function (req, res) {
        // Event value must be numeric.
        trackDimension('Feedback', 'Rating', 'Feedback for Movie', '3', 'Guardian\'s of the Galaxy', '1')
            .then(function (response) {
                console.log(response.body);
                res.status(200).send('Event tracked.').end();
            })
    });

app.use('/', router);
app.listen(process.env.PORT || 8080);
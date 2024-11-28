require('dotenv').config(); // Load environment variables from .env file
const { MongoClient, ObjectId } = require("mongodb");
const express = require("express");
const passport = require("passport");
const FacebookStrategy = require("passport-facebook").Strategy;
const session = require("express-session");
const formidable = require("express-formidable");

const mongoUrl = process.env.MONGO_URL;
const dbName = "tableBooking";
const collectionName = "tables";
const client = new MongoClient(mongoUrl, {
    serverApi: { version: "1", strict: true, deprecationErrors: true },
});

const app = express();
app.set("view engine", "ejs");
app.set("views", __dirname + "/views");
app.use(formidable());
app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: true,
    })
);
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser(function (user, done) {
    done(null, user);
});
passport.deserializeUser(function (id, done) {
    done(null, id);
});
passport.use(
    new FacebookStrategy(
        {
            clientID: process.env.FACEBOOK_CLIENT_ID,
            clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
            callbackURL: process.env.FACEBOOK_CALLBACK_URL,
        },
        function (token, refreshToken, profile, done) {
            const user = {
                id: profile.id,
                name: profile.displayName,
                type: profile.provider,
            };
            return done(null, user);
        }
    )
);

const isLoggedIn = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    res.redirect("/login");
};

let db;
client.connect().then(() => {
    db = client.db(dbName);
});

const insertDocument = async (db, doc) => {
    const collection = db.collection(collectionName);
    return await collection.insertOne(doc);
};
const findDocument = async (db, criteria) => {
    const collection = db.collection(collectionName);
    return await collection.find(criteria).toArray();
};
const updateDocument = async (db, criteria, update) => {
    const collection = db.collection(collectionName);
    return await collection.updateOne(criteria, { $set: update });
};
const deleteDocument = async (db, criteria) => {
    const collection = db.collection(collectionName);
    return await collection.deleteOne(criteria);
};

app.use((req, res, next) => {
    let d = new Date();
    console.log(`TRACE: ${req.path} was requested at ${d.toLocaleDateString()}`);
    next();
});

// Routes and RESTful API Endpoints
app.get("/login", (req, res) => {
    res.render("login");
});
app.get("/logout", (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error("Error logging out:", err);
            return res.status(500).render("info", {
                message: "Error logging out. Please try again.",
                user: req.user || { name: "Guest", type: "Unknown", id: "N/A" },
            });
        }
        res.redirect("/login");
    });
});

app.get("/auth/facebook", passport.authenticate("facebook", { scope: "email" }));

app.get(
    "/auth/facebook/callback",
    passport.authenticate("facebook", {
        successRedirect: "/content",
        failureRedirect: "/login",
    })
);

app.get("/", (req, res) => {
    res.redirect("/content");
});

app.get("/content", isLoggedIn, async (req, res) => {
    const bookings = await findDocument(db, { userid: req.user.id });
    res.render("list", { user: req.user, bookings, nBookings: bookings.length });
});

app.get("/*", (req, res) => {
    res.status(404).render("info", {
        message: `${req.path} - Unknown request!`,
        user: req.user || { name: "Guest", type: "Unknown", id: "N/A" },
    });
});

const port = process.env.PORT || 8099;
app.listen(port, () => {
    console.log(`Listening at http://localhost:${port}`);
});

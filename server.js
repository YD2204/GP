const { MongoClient, ObjectId } = require("mongodb");
const mongoUrl = "mongodb+srv://1753720408thomaswong:UkUSqkvud8pFtrzk@cluster0.sg5yb.mongodb.net/?retryWrites=true&w=majority";
const dbName = "tableBooking";
const collectionName = "tables";
const client = new MongoClient(mongoUrl, {
    serverApi: { version: "1", strict: true, deprecationErrors: true },
});
const express = require("express");
const passport = require("passport");
const FacebookStrategy = require("passport-facebook").Strategy;
const session = require("express-session");
const formidable = require("express-formidable");

const app = express();
app.set("view engine", "ejs");
app.set("views",__dirname+ "/views");
app.use(formidable());
app.use(
    session({
        secret: "your_session_secret",
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
            clientID: "874667274743274",
            clientSecret: "e0bce212a3f2e9107a65d24000995a83",
            callbackURL: "https://gp-qklp.onrender.com/auth/facebook/callback",
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

// RESTful API Endpoints
app.post('/api/booking/:bookingid', async (req, res) => {
    const { date, time, tableNumber, phone_number } = req.fields;

    if (!date || !time || !tableNumber || !phone_number) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    const existingBooking = await findDocument(db, {
        date,
        time,
        tableNumber: parseInt(tableNumber, 10),
    });

    if (existingBooking.length > 0) {
        return res.status(400).json({ error: `Table ${tableNumber} is already booked at ${time} on ${date}.` });
    }

    const newBooking = {
        bookingid: req.params.bookingid,
        phone_number,
        date,
        time,
        tableNumber: parseInt(tableNumber, 10),
        userid: req.user ? req.user.id : "API_USER",
    };

    await insertDocument(db, newBooking);
    res.status(200).json({ success: true, message: "Booking created", booking: newBooking });
});

app.get('/api/booking/:bookingid', async (req, res) => {
    const { bookingid } = req.params;

    if (!bookingid) {
        return res.status(400).json({ error: 'Booking ID is required' });
    }

    const booking = await findDocument(db, { bookingid });

    if (booking.length > 0) {
        res.status(200).json(booking[0]);
    } else {
        res.status(404).json({ error: 'Booking not found' });
    }
});

app.put('/api/booking/:bookingid', async (req, res) => {
    const { bookingid } = req.params;

    if (!bookingid) {
        return res.status(400).json({ error: 'Booking ID is required' });
    }

    const updatedData = req.fields;

    if (!updatedData.date || !updatedData.time || !updatedData.tableNumber || !updatedData.phone_number) {
        return res.status(400).json({ error: 'All fields (date, time, tableNumber, phone_number) are required' });
    }

    const result = await updateDocument(db, { bookingid }, updatedData);

    if (result.modifiedCount > 0) {
        res.status(200).json({ success: true, message: 'Booking updated successfully' });
    } else {
        res.status(404).json({ error: 'Booking not found or no changes made' });
    }
});

app.delete('/api/booking/:bookingid', async (req, res) => {
    const { bookingid } = req.params;

    if (!bookingid) {
        return res.status(400).json({ error: 'Booking ID is required' });
    }

    const result = await deleteDocument(db, { bookingid });

    if (result.deletedCount > 0) {
        res.status(200).json({ success: true, message: `Booking with ID ${bookingid} deleted successfully` });
    } else {
        res.status(404).json({ error: 'Booking not found' });
    }
});

// Catch-all route
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

require('dotenv').config(); // Load environment variables from .env file
const { MongoClient, ObjectId } = require("mongodb");
const express = require("express");
const passport = require("passport");
const FacebookStrategy = require("passport-facebook").Strategy;
const session = require("express-session");
const formidable = require("express-formidable");
const path = require("path");

const mongoUrl = process.env.MONGO_URL;
const dbName = "tableBooking";
const collectionName = "tables";
const client = new MongoClient(mongoUrl, {
    serverApi: { version: "1", strict: true, deprecationErrors: true },
});

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views")); // Set views directory

// Middleware setup
app.use(
    session({
        secret: process.env.SESSION_SECRET || "defaultSecret",
        resave: false,
        saveUninitialized: true,
        cookie: { secure: false }, // Use `secure: true` in production with HTTPS
    })
);
app.use(passport.initialize());
app.use(passport.session());
app.use(formidable()); // Middleware to handle form data

// Passport serialization and strategy
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

// MongoDB connection
let db;
client.connect()
    .then(() => {
        db = client.db(dbName);
        console.log("Connected to MongoDB");
    })
    .catch(err => {
        console.error("Failed to connect to MongoDB:", err);
        process.exit(1);
    });

// Helper functions for database operations
const insertDocument = async (db, doc) => {
    const collection = db.collection(collectionName);
    return await collection.insertOne(doc);
};
const findDocument = async (db, criteria) => {
    const collection = db.collection(collectionName);
    return await collection.find(criteria).toArray();
};

// Middleware to check if user is logged in
const isLoggedIn = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    res.redirect("/login");
};

// Routes
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

app.get("/create", isLoggedIn, async (req, res) => {
    try {
        const { date, time } = req.query;

        // Fetch all bookings for the selected date and time
        let bookedTables = [];
        if (date && time) {
            const bookings = await findDocument(db, { date, time });
            bookedTables = bookings.map((b) => b.tableNumber);
        }

        // Generate list of all tables (1 to 10)
        const allTables = Array.from({ length: 10 }, (_, i) => i + 1);
        const availableTables = allTables.filter((table) => !bookedTables.includes(table));

        res.render("create", {
            user: req.user,
            availableTables,
        });
    } catch (error) {
        console.error("Error in /create route:", error);
        res.status(500).send("Internal Server Error");
    }
});

app.post("/create", isLoggedIn, async (req, res) => {
    try {
        const { date, time, tableNumber, phone_number } = req.fields;

        if (!date || !time || !tableNumber || !phone_number) {
            return res.status(400).send("All fields are required");
        }

        const existingBooking = await findDocument(db, { date, time, tableNumber });
        if (existingBooking.length > 0) {
            return res.status(400).send("The selected table is already booked for this time slot.");
        }

        const newBooking = {
            phone_number,
            date,
            time,
            tableNumber: parseInt(tableNumber, 10),
            userid: req.user.id,
        };

        await insertDocument(db, newBooking);
        res.redirect("/content");
    } catch (error) {
        console.error("Error in POST /create:", error);
        res.status(500).send("Internal Server Error");
    }
});

app.get('/api/availability', async (req, res) => {
    const { date, time } = req.query;

    if (!date || !time) {
        return res.status(400).json({ error: 'Date and time are required' });
    }

    const bookings = await findDocument(db, { date, time });
    const allTables = Array.from({ length: 10 }, (_, i) => i + 1); // Tables 1 to 10
    const bookedTables = bookings.map(b => b.tableNumber);
    const availableTables = allTables.filter(table => !bookedTables.includes(table));

    res.json({ tables: availableTables });
});

app.get("/details", isLoggedIn, async (req, res) => {
    const bookingId = req.query._id;

    if (!bookingId) {
        return res.status(400).send("Booking ID is required.");
    }

    try {
        const booking = await findDocument(db, { _id: new ObjectId(bookingId) });
        if (booking.length === 0) {
            return res.status(404).send("Booking not found.");
        }
        res.render("details", { user: req.user, booking: booking[0] });
    } catch (err) {
        res.status(500).send("Error fetching booking details.");
    }
});

app.get("/edit", isLoggedIn, async (req, res) => {
    const booking = await findDocument(db, { _id: new ObjectId(req.query._id) });
    res.render("edit", { user: req.user, booking: booking[0] });
});

app.post("/update", isLoggedIn, async (req, res) => {
    const updatedBooking = {
        date: req.fields.date,
        time: req.fields.time,
        tableNumber: parseInt(req.fields.tableNumber, 10),
        phone_number: req.fields.phone_number,
    };

    await updateDocument(db, { _id: new ObjectId(req.fields._id) }, updatedBooking);
    res.redirect("/content");
});

app.get("/delete", isLoggedIn, async (req, res) => {
    const bookingId = req.query._id;

    if (!bookingId) {
        return res.status(400).send("Booking ID is required.");
    }

    const result = await deleteDocument(db, { _id: new ObjectId(bookingId) });

    if (result.deletedCount > 0) {
        res.render("info", {
            user: req.user,
            message: "The booking has been deleted successfully.",
        });
    } else {
        res.status(500).send("Failed to delete booking.");
    }
});

app.get("/*", (req, res) => {
    res.status(404).render("info", {
        message: `${req.path} - Unknown request!`,
        user: req.user || { name: "Guest", type: "Unknown", id: "N/A" },
    });
});

// Server setup
const port = process.env.PORT || 8099;
app.listen(port, () => {
    console.log(`Listening at http://localhost:${port}`);
});

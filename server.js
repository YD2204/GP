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
const insertDocument = async (doc) => {
    const collection = db.collection(collectionName);
    return await collection.insertOne(doc);
};
const findDocument = async (criteria) => {
    const collection = db.collection(collectionName);
    return await collection.find(criteria).toArray();
};
const updateDocument = async (criteria, update) => {
    const collection = db.collection(collectionName);
    return await collection.updateOne(criteria, { $set: update });
};
const deleteDocument = async (criteria) => {
    const collection = db.collection(collectionName);
    return await collection.deleteOne(criteria);
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
    const bookings = await findDocument({ userid: req.user.id });
    res.render("list", { user: req.user, bookings, nBookings: bookings.length });
});

app.get("/create", isLoggedIn, async (req, res) => {
    try {
        const { date, time } = req.query;

        // Fetch all bookings for the selected date and time
        let bookedTables = [];
        if (date && time) {
            const bookings = await findDocument({ date, time });
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

        // Validate input fields
        if (!date || !time || !tableNumber || !phone_number) {
            return res.status(400).send("All fields are required");
        }

        // Check if a booking for the selected table at the specified date and time already exists
        const existingBooking = await findDocument({ date, time, tableNumber: parseInt(tableNumber, 10) });

        if (existingBooking.length > 0) {
            // Render a page with an error message and a button to go back to the create page
            return res.status(400).render("info", {
                message: "The selected table is already booked for this time slot.",
                user: req.user,
                backLink: "/create"
            });
        }

        // Create the new booking
        const newBooking = {
            phone_number,
            date,
            time,
            tableNumber: parseInt(tableNumber, 10),
            userid: req.user.id,
        };

        await insertDocument(newBooking);
        res.redirect("/content");
    } catch (error) {
        console.error("Error in /create:", error);
        res.status(500).send("Internal Server Error");
    }
});

app.get('/api/availability', async (req, res) => {
    const { date, time } = req.query;

    if (!date || !time) {
        return res.status(400).json({ error: 'Date and time are required' });
    }

    const bookings = await findDocument({ date, time });
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
        // Convert bookingId to ObjectId and fetch the booking
        const booking = await findDocument({ _id: new ObjectId(bookingId) });

        if (!booking || booking.length === 0) {
            return res.status(404).send("Booking not found.");
        }

        // Render the booking details
        res.render("details", { user: req.user, booking: booking[0] });
    } catch (err) {
        console.error("Error fetching booking details:", err);
        res.status(500).send("Error fetching booking details.");
    }
});

// Route to edit a specific booking
app.get("/edit", isLoggedIn, async (req, res) => {
    const bookingId = req.query._id;

    // Validate the booking ID
    if (!bookingId || !ObjectId.isValid(bookingId)) {
        return res.status(400).send("Invalid or missing Booking ID.");
    }

    try {
        // Fetch the booking from the database
        const booking = await findDocument({ _id: new ObjectId(bookingId) });

        if (!booking || booking.length === 0) {
            return res.status(404).send("Booking not found.");
        }

        // Extract `date`, `time`, and `tableNumber` from the existing booking
        const { date, time, tableNumber } = booking[0];

        // Fetch all bookings for the same date, time, and tableNumber, excluding the current booking
        const existingBooking = await findDocument({
            date,
            time,
            tableNumber: parseInt(tableNumber, 10),
            _id: { $ne: new ObjectId(bookingId) }
        });

        if (existingBooking.length > 0) {
            // Render a page with an error message and a button to go back to the edit page
            return res.status(400).render("info", {
                message: "The selected table is already booked for this time slot.",
                user: req.user,
                backLink: `/edit?_id=${bookingId}`
            });
        }

        // Generate list of all tables (1 to 10)
        const allTables = Array.from({ length: 10 }, (_, i) => i + 1);
        const otherBookings = await findDocument({
            date,
            time,
            _id: { $ne: new ObjectId(bookingId) }
        });
        const bookedTables = otherBookings.map((b) => b.tableNumber);
        const availableTables = allTables.filter((table) => !bookedTables.includes(table));

        // Render the edit page with booking and available tables
        res.render("edit", {
            user: req.user,
            booking: booking[0],
            availableTables,
        });
    } catch (error) {
        console.error("Error fetching booking for edit:", error);
        res.status(500).send("Error fetching booking details.");
    }
});

// Route to handle booking update
app.post("/update", isLoggedIn, async (req, res) => {
    const bookingId = req.fields._id;

    // Validate input fields
    if (!bookingId || !ObjectId.isValid(bookingId)) {
        return res.status(400).send("Invalid or missing Booking ID.");
    }

    const updatedBooking = {
        date: req.fields.date,
        time: req.fields.time,
        tableNumber: parseInt(req.fields.tableNumber, 10),
        phone_number: req.fields.phone_number,
    };

    try {
        // Check if another booking exists for the same table, date, and time (excluding the current one)
        const conflictingBooking = await findDocument({
            date: updatedBooking.date,
            time: updatedBooking.time,
            tableNumber: updatedBooking.tableNumber,
            _id: { $ne: new ObjectId(bookingId) },
        });

        if (conflictingBooking.length > 0) {
            // Render a page with an error message and a button to go back to the edit page
            return res.status(400).render("info", {
                message: "The selected table is already booked for this time slot.",
                user: req.user,
                backLink: `/details?_id=${bookingId}`
            });
        }

        // Proceed with updating the booking
        const result = await updateDocument({ _id: new ObjectId(bookingId) }, updatedBooking);

        if (result.matchedCount === 0) {
            return res.status(404).send("Booking not found.");
        }

        res.redirect("/content");
    } catch (error) {
        console.error("Error updating booking:", error);
        res.status(500).send("Error updating booking.");
    }
});

// Route to delete a specific booking
app.get("/delete", isLoggedIn, async (req, res) => {
    const bookingId = req.query._id;

    if (!bookingId) {
        return res.status(400).send("Booking ID is required.");
    }

    try {
        // Delete the booking from the database
        const result = await deleteDocument({ _id: new ObjectId(bookingId) });

        if (result.deletedCount > 0) {
            res.render("info", {
                user: req.user,
                message: "The booking has been deleted successfully.",
                backLink: `/content`
            });
        } else {
            res.render("info", {
            user: req.user,
             message: "Booking not found.",
            backLink: `/content`
        });
        }
    } catch (err) {
        console.error("Error deleting booking:", err);
        res.status(500).send("Failed to delete booking.");
    }
});

// RESTful API Routes
// 1. Read (GET Method) - Retrieve all bookings or specific booking
app.get('/api/bookings', async (req, res) => {
    try {
        const bookings = await findDocument(req.query);
        res.status(200).json(bookings);
    } catch (error) {
        console.error("Error retrieving bookings:", error);
        res.status(500).json({ error: "An error occurred while fetching bookings." });
    }
});

// 2. Create (POST Method) - Create a new booking
app.post('/api/bookings', async (req, res) => {
    const { date, time, tableNumber, phone_number } = req.fields;
    if (!date || !time || !tableNumber || !phone_number) {
        return res.status(400).json({ error: "All fields are required." });
    }

    try {
        const newBooking = { date, time, tableNumber: parseInt(tableNumber, 10), phone_number };
        const result = await insertDocument(newBooking);
        res.status(201).json({ message: "Booking created successfully.", bookingId: result.insertedId });
    } catch (error) {
        console.error("Error creating booking:", error);
        res.status(500).json({ error: "An error occurred while creating the booking." });
    }
});

// 3. Update (PUT Method) - Update an existing booking
app.put('/api/bookings/:id', async (req, res) => {
    const bookingId = req.params.id;

    if (!ObjectId.isValid(bookingId)) {
        return res.status(400).json({ error: "Invalid booking ID." });
    }

    try {
        const updatedData = req.fields; // You can also use req.body if it's JSON data
        const result = await updateDocument({ _id: new ObjectId(bookingId) }, updatedData);

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: "Booking not found." });
        }

        res.status(200).json({ message: "Booking updated successfully." });
    } catch (error) {
        console.error("Error updating booking:", error);
        res.status(500).json({ error: "An error occurred while updating the booking." });
    }
});

// 4. Delete (DELETE Method) - Delete an existing booking
app.delete('/api/bookings/:id', async (req, res) => {
    const bookingId = req.params.id;

    if (!ObjectId.isValid(bookingId)) {
        return res.status(400).json({ error: "Invalid booking ID." });
    }

    try {
        const result = await deleteDocument({ _id: new ObjectId(bookingId) });

        if (result.deletedCount === 0) {
            return res.status(404).json({ error: "Booking not found." });
        }

        res.status(200).json({ message: "Booking deleted successfully." });
    } catch (error) {
        console.error("Error deleting booking:", error);
        res.status(500).json({ error: "An error occurred while deleting the booking." });
    }
});

// Server setup
const port = process.env.PORT || 8099;
app.listen(port, () => {
    console.log(`Listening at http://localhost:${port}`);
});

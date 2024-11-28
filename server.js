require('dotenv').config(); // Load environment variables
const { MongoClient, ObjectId } = require("mongodb");

const express = require("express");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const FacebookStrategy = require("passport-facebook").Strategy;
const session = require("express-session");
const formidable = require("express-formidable");
const bcrypt = require("bcrypt");

const mongoUrl = process.env.MONGO_URL;
const dbName = "tableBooking";
const usersCollectionName = "users"; // New collection for storing users
const tablesCollectionName = "tables"; // Existing collection for table bookings

const collectionName = tablesCollectionName; // Now, tablesCollectionName is defined before this line

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
        cookie: { secure: false }, // Secure should be true in production with HTTPS
    })
);

app.use(passport.initialize());
app.use(passport.session());

let db;
client.connect()
    .then(() => {
        db = client.db(dbName);
        console.log("Connected to MongoDB");
    })
    .catch(err => {
        console.error("Failed to connect to MongoDB:", err);
        process.exit(1); // Exit if the database connection fails
    });
const findUser = async (criteria) => {
    const collection = db.collection(usersCollectionName);
    const user = await collection.findOne(criteria);
    console.log("findUser result for criteria", criteria, ":", user); // Debugging log
    return user;
};


const createUser = async (user) => {
    const collection = db.collection(usersCollectionName);
    return await collection.insertOne(user);
};


passport.use(
    new FacebookStrategy(
        {
            clientID: process.env.FACEBOOK_CLIENT_ID,
            clientSecret: process.env.FACEBOOK_CLIENT_SECRET,
            callbackURL: process.env.FACEBOOK_CALLBACK_URL,
        },
        async (token, refreshToken, profile, done) => {
            try {
                // Check if user already exists in the database
                let user = await findUser({ facebookId: profile.id });
                if (!user) {
                    // Create a new user if not found
                    user = {
                        facebookId: profile.id,
                        username: profile.displayName,
                        type: "facebook",
                    };
                    await createUser(user);
                }
                return done(null, user);
            } catch (err) {
                return done(err);
            }
        }
    )
);

passport.serializeUser((user, done) => {
    done(null, user._id); // Use the user's ID to identify the session
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await findUser({ _id: new ObjectId(id) });
        done(null, user); // Attach the user object to the session
    } catch (err) {
        done(err, null);
    }
});

passport.use(
    new LocalStrategy(async (username, password, done) => {
        console.log("Attempting login for:", username); // Log username attempt
        try {
            const user = await findUser({ username });
            if (!user) {
                console.log("User not found:", username); // Log user not found
                return done(null, false, { message: "Invalid username or password" });
            }
            console.log("User found:", user); // Log user details

            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                console.log("Invalid password for user:", username); // Log invalid password
                return done(null, false, { message: "Invalid username or password" });
            }

            console.log("Login successful for user:", username); // Log successful login
            return done(null, user);
        } catch (err) {
            console.error("Error in LocalStrategy:", err); // Log unexpected errors
            return done(err);
        }
    })
);




const isLoggedIn = (req, res, next) => {
    if (req.isAuthenticated()) return next();
    res.redirect("/login");
};

app.get("/signup", (req, res) => {
    res.render("signup");
});

app.post("/signup", async (req, res) => {
    const { username, password } = req.fields;

    if (!username || !password) {
        return res.status(400).send("Username and password are required.");
    }

    const existingUser = await findUser({ username });
    if (existingUser) {
        return res.status(400).send("Username is already taken.");
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    console.log("Hashed password:", hashedPassword); // Log the hashed password
    await createUser({ username, password: hashedPassword });

    console.log("User created:", { username, hashedPassword }); // Debug log
    res.redirect("/login");
});


    const hashedPassword = await bcrypt.hash(password, 10);
    await createUser({ username, password: hashedPassword });

    console.log("User created:", { username }); // Debugging log

    res.redirect("/login");
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

app.post(
    "/login",
    passport.authenticate("local", {
        successRedirect: "/content",
        failureRedirect: "/login",
        failureFlash: false,
    })
);


app.get("/logout", (req, res) => {
    req.logout((err) => {
        if (err) {
            console.error("Error logging out:", err);
            return res.status(500).send("Error logging out.");
        }
        res.redirect("/login");
    });
});

app.get("/auth/facebook", passport.authenticate("facebook"));
app.get(
    "/auth/facebook/callback",
    passport.authenticate("facebook", {
        successRedirect: "/content",
        failureRedirect: "/login",
    })
);

app.get("/", (req, res) => {
    if (req.isAuthenticated()) {
        res.redirect("/content");
    } else {
        res.redirect("/login");
    }
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
        console.error("Error in /create:", error);
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

    res.json({
        tables: availableTables,
    });
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
    try {
        const bookingId = req.query._id;

        if (!bookingId) {
            return res.status(400).send("Booking ID is required.");
        }

        const booking = await findDocument(db, { _id: new ObjectId(bookingId) });

        if (booking.length === 0) {
            return res.status(404).send("Booking not found.");
        }

        const { date, time } = booking[0];

        // Fetch all bookings for the selected date and time, except the current booking
        const otherBookings = await findDocument(db, {
            date,
            time,
            _id: { $ne: new ObjectId(bookingId) },
        });

        // Identify booked tables
        const bookedTables = otherBookings.map((b) => b.tableNumber);

        // Generate list of all tables (1 to 10)
        const allTables = Array.from({ length: 10 }, (_, i) => i + 1);
        const availableTables = allTables.filter((table) => !bookedTables.includes(table));

        res.render("edit", {
            user: req.user,
            booking: booking[0],
            availableTables,
        });
    } catch (error) {
        console.error("Error in /edit route:", error);
        res.status(500).send("Internal Server Error");
    }
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

const port = process.env.PORT || 8099;
app.listen(port, () => {
    console.log(`Listening at http://localhost:${port}`);
});

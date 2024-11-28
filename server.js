import dotenv from 'dotenv';
dotenv.config();

import { MongoClient, ObjectId } from "mongodb";
import express from "express";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as FacebookStrategy } from "passport-facebook";
import session from "express-session";
import formidable from "express-formidable";
import bcrypt from "bcrypt";
import path from "path"; // Import path for handling file paths
import { fileURLToPath } from "url"; // Required for __dirname in ES modules

// Define __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const mongoUrl = process.env.MONGO_URL;
const dbName = "tableBooking";
const usersCollectionName = "users";
const tablesCollectionName = "tables";
const collectionName = tablesCollectionName;

const client = new MongoClient(mongoUrl, {
    serverApi: { version: "1", strict: true, deprecationErrors: true },
});

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(formidable());
app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: true,
        cookie: { secure: false },
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
        process.exit(1);
    });

const findUser = async (criteria) => {
    const collection = db.collection(usersCollectionName);
    const standardizedCriteria = { ...criteria };
    if (criteria.username) {
        standardizedCriteria.username = criteria.username.toLowerCase();
    }
    const user = await collection.findOne(standardizedCriteria);
    console.log("findUser result for criteria", standardizedCriteria, ":", user);
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
                let user = await findUser({ facebookId: profile.id });
                if (!user) {
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
    done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await findUser({ _id: new ObjectId(id) });
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

passport.use(
    new LocalStrategy(async (username, password, done) => {
        console.log("Attempting login for:", username);
        try {
            const user = await findUser({ username });
            if (!user) {
                console.log("User not found:", username);
                return done(null, false, { message: "Invalid username or password" });
            }
            const isPasswordValid = await bcrypt.compare(password, user.password);
            if (!isPasswordValid) {
                console.log("Invalid password for user:", username);
                return done(null, false, { message: "Invalid username or password" });
            }
            return done(null, user);
        } catch (err) {
            console.error("Error in LocalStrategy:", err);
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
    if (username.trim().length < 3 || password.trim().length < 6) {
        return res.status(400).send("Username must be at least 3 characters and password at least 6 characters.");
    }
    const existingUser = await findUser({ username: username.toLowerCase() });
    if (existingUser) {
        return res.status(400).send("Username is already taken.");
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await createUser({ username: username.toLowerCase(), password: hashedPassword });
        res.redirect("/login");
    } catch (error) {
        console.error("Error creating user:", error);
        res.status(500).send("Internal server error.");
    }
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

app.get("/", (req, res) => {
    if (req.isAuthenticated()) {
        res.redirect("/content");
    } else {
        res.redirect("/login");
    }
});

const port = process.env.PORT || 8099;
app.listen(port, () => {
    console.log(`Listening at http://localhost:${port}`);
});

// Main application file for Jiajiri Hub

// Import required modules
const express = require("express")
const mysql = require("mysql2/promise")
const bcrypt = require("bcrypt")
const session = require("express-session")
const MySQLStore = require("express-mysql-session")(session)
const multer = require("multer")
const path = require("path")
const fs = require("fs")
const { body, validationResult } = require("express-validator")

// Initialize Express app
const app = express()
const PORT = process.env.PORT || 7000

// Configure middleware
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, "public"))) // Ensure correct path for static files

// Set up EJS as the view engine
app.set("view engine", "ejs")
app.set("views", path.join(__dirname, "views"))

// Database connection pool
const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "",
  database: "jiajiri_hub",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
})

// Session store configuration
const sessionStore = new MySQLStore(
  {
    clearExpired: true,
    checkExpirationInterval: 900000, // 15 minutes
    expiration: 86400000, // 24 hours
  },
  pool,
)

// Configure session middleware
app.use(
  session({
    key: "jiajiri_session",
    secret: "jiajiri_secret_key",
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 86400000, // 24 hours
    },
  }),
)

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, "public", "uploads")
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9)
    const ext = path.extname(file.originalname)
    cb(null, file.fieldname + "-" + uniqueSuffix + ext)
  },
})

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif/
    const mimetype = filetypes.test(file.mimetype)
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase())

    if (mimetype && extname) {
      return cb(null, true)
    }
    cb(new Error("Only image files are allowed!"))
  },
})

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) {
    return next()
  }
  res.redirect("/login")
}

// Middleware to check if user is a worker
const isWorker = async (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect("/login")
  }

  try {
    const [rows] = await pool.query("SELECT role FROM users WHERE id = ?", [req.session.userId])
    if (rows.length > 0 && rows[0].role === "worker") {
      return next()
    }
    res.redirect("/dashboard")
  } catch (error) {
    console.error("Error checking user role:", error)
    res.status(500).render("error", { message: "Internal server error" })
  }
}

// Middleware to check if user is a client
const isClient = async (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect("/login")
  }

  try {
    const [rows] = await pool.query("SELECT role FROM users WHERE id = ?", [req.session.userId])
    if (rows.length > 0 && rows[0].role === "client") {
      return next()
    }
    res.redirect("/dashboard")
  } catch (error) {
    console.error("Error checking user role:", error)
    res.status(500).render("error", { message: "Internal server error" })
  }
}

// Middleware to check if user is an admin
const isAdmin = async (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect("/login")
  }

  try {
    const [rows] = await pool.query("SELECT role FROM users WHERE id = ?", [req.session.userId])
    if (rows.length > 0 && rows[0].role === "admin") {
      return next()
    }
    res.redirect("/dashboard")
  } catch (error) {
    console.error("Error checking user role:", error)
    res.status(500).render("error", { message: "Internal server error" })
  }
}

// Middleware to make user data available to all views
app.use(async (req, res, next) => {
  res.locals.user = null
  if (req.session.userId) {
    try {
      const [rows] = await pool.query("SELECT id, name, email, role FROM users WHERE id = ?", [req.session.userId])
      if (rows.length > 0) {
        res.locals.user = rows[0]
      }
    } catch (error) {
      console.error("Error fetching user data:", error)
    }
  }
  next()
})

// Routes

// Home page
app.get("/", async (req, res) => {
  try {
    // Get featured workers (those with highest ratings)
    const [featuredWorkers] = await pool.query(`
      SELECT wp.*, u.name, u.email, COUNT(r.id) as review_count 
      FROM worker_profiles wp 
      JOIN users u ON wp.user_id = u.id 
      LEFT JOIN reviews r ON wp.id = r.worker_id 
      GROUP BY wp.id 
      ORDER BY wp.average_rating DESC, review_count DESC 
      LIMIT 6
    `)

    // Process the ratings to ensure they're numbers
    featuredWorkers.forEach((worker) => {
      worker.average_rating = Number(worker.average_rating) || 0
    })

    // Get service categories
    const [categories] = await pool.query("SELECT * FROM service_categories")

    // Get testimonials (recent positive reviews)
    const [testimonials] = await pool.query(`
      SELECT r.*, u.name as client_name, wp.service_category, wu.name as worker_name 
      FROM reviews r 
      JOIN users u ON r.client_id = u.id 
      JOIN worker_profiles wp ON r.worker_id = wp.id 
      JOIN users wu ON wp.user_id = wu.id 
      WHERE r.rating >= 4 
      ORDER BY r.created_at DESC 
      LIMIT 3
    `)

    res.render("index", {
      featuredWorkers,
      categories,
      testimonials,
      title: "Jiajiri Hub - Connect with Local Service Providers",
    })
  } catch (error) {
    console.error("Error fetching home page data:", error)
    res.status(500).render("error", { message: "Failed to load home page" })
  }
})

// Register page
app.get("/register", (req, res) => {
  res.render("register", { title: "Register - Jiajiri Hub", errors: [] })
})

// Register form submission
app.post(
  "/register",
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().withMessage("Valid email is required"),
    body("phone")
      .matches(/^\+?[0-9]{10,15}$/)
      .withMessage("Valid phone number is required"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
    body("confirmPassword").custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error("Passwords do not match")
      }
      return true
    }),
    body("role").isIn(["worker", "client"]).withMessage("Invalid role"),
  ],
  async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.render("register", {
        title: "Register - Jiajiri Hub",
        errors: errors.array(),
        formData: req.body,
      })
    }

    try {
      // Check if email or phone already exists
      const [existingUser] = await pool.query("SELECT * FROM users WHERE email = ? OR phone = ?", [
        req.body.email,
        req.body.phone,
      ])

      if (existingUser.length > 0) {
        return res.render("register", {
          title: "Register - Jiajiri Hub",
          errors: [{ msg: "Email or phone number already registered" }],
          formData: req.body,
        })
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(req.body.password, 10)

      // Insert new user
      const [result] = await pool.query(
        "INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)",
        [req.body.name, req.body.email, req.body.phone, hashedPassword, req.body.role],
      )

      // If user is a worker, create empty profile
      if (req.body.role === "worker") {
        await pool.query(
          "INSERT INTO worker_profiles (user_id, location, service_category, price_range) VALUES (?, ?, ?, ?)",
          [result.insertId, "", "", ""],
        )
      }

      // After successful registration, redirect to login with a success message
      res.render("login", {
        title: "Login - Jiajiri Hub",
        error: null,
        successMessage: "Registration successful! Please log in with your credentials.",
      })
    } catch (error) {
      console.error("Registration error:", error)
      res.render("register", {
        title: "Register - Jiajiri Hub",
        errors: [{ msg: "Registration failed. Please try again." }],
        formData: req.body,
      })
    }
  },
)

// Login page
app.get("/login", (req, res) => {
  res.render("login", { title: "Login - Jiajiri Hub", error: null, successMessage: null })
})

// Login form submission
app.post("/login", async (req, res) => {
  try {
    // Find user by email
    const [users] = await pool.query("SELECT * FROM users WHERE email = ?", [req.body.email])

    if (users.length === 0) {
      return res.render("login", {
        title: "Login - Jiajiri Hub",
        error: "Invalid email or password",
        successMessage: null,
      })
    }

    const user = users[0]

    // Compare password
    const passwordMatch = await bcrypt.compare(req.body.password, user.password_hash)

    if (!passwordMatch) {
      return res.render("login", {
        title: "Login - Jiajiri Hub",
        error: "Invalid email or password",
        successMessage: null,
      })
    }

    // Set session and redirect
    req.session.userId = user.id
    req.session.userRole = user.role

    if (user.role === "admin") {
      res.redirect("/admin/dashboard")
    } else if (user.role === "worker") {
      // Check if worker has completed their profile
      const [profiles] = await pool.query("SELECT * FROM worker_profiles WHERE user_id = ?", [user.id])

      if (profiles.length > 0 && profiles[0].bio && profiles[0].location && profiles[0].service_category) {
        // Profile is complete, go to dashboard
        res.redirect("/dashboard")
      } else {
        // Profile is incomplete, go to edit profile
        res.redirect("/profile/edit")
      }
    } else {
      // Client users go straight to dashboard
      res.redirect("/dashboard")
    }
  } catch (error) {
    console.error("Login error:", error)
    res.render("login", {
      title: "Login - Jiajiri Hub",
      error: "Login failed. Please try again.",
      successMessage: null,
    })
  }
})

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err)
    }
    res.redirect("/")
  })
})

// Dashboard route
app.get("/dashboard", isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId
    const [users] = await pool.query("SELECT * FROM users WHERE id = ?", [userId])
    const user = users[0]

    if (user.role === "worker") {
      // Get worker profile
      const [profiles] = await pool.query("SELECT * FROM worker_profiles WHERE user_id = ?", [userId])
      const profile = profiles[0]

      // Ensure average_rating is a number
      profile.average_rating = Number(profile.average_rating) || 0

      // Get pending job requests
      const [pendingJobs] = await pool.query(
        `
        SELECT jr.*, u.name as client_name, u.phone as client_phone 
        FROM job_requests jr 
        JOIN users u ON jr.client_id = u.id 
        WHERE jr.worker_id = ? AND jr.status = 'pending' 
        ORDER BY jr.created_at DESC
      `,
        [profile.id],
      )

      // Get active jobs
      const [activeJobs] = await pool.query(
        `
        SELECT jr.*, u.name as client_name, u.phone as client_phone 
        FROM job_requests jr 
        JOIN users u ON jr.client_id = u.id 
        WHERE jr.worker_id = ? AND jr.status = 'accepted' 
        ORDER BY jr.scheduled_time ASC
      `,
        [profile.id],
      )

      // Get completed jobs
      const [completedJobs] = await pool.query(
        `
        SELECT jr.*, u.name as client_name, r.rating, r.comment 
        FROM job_requests jr 
        JOIN users u ON jr.client_id = u.id 
        LEFT JOIN reviews r ON jr.id = r.job_id 
        WHERE jr.worker_id = ? AND jr.status = 'completed' 
        ORDER BY jr.completed_at DESC 
        LIMIT 5
      `,
        [profile.id],
      )

      res.render("worker-dashboard", {
        title: "Worker Dashboard - Jiajiri Hub",
        user,
        profile,
        pendingJobs,
        activeJobs,
        completedJobs,
      })
    } else if (user.role === "client") {
      // Get active job requests
      const [activeRequests] = await pool.query(
        `
        SELECT jr.*, u.name as worker_name, wp.service_category, wp.image_url as worker_image 
        FROM job_requests jr 
        JOIN worker_profiles wp ON jr.worker_id = wp.id 
        JOIN users u ON wp.user_id = u.id 
        WHERE jr.client_id = ? AND (jr.status = 'pending' OR jr.status = 'accepted') 
        ORDER BY jr.created_at DESC
      `,
        [userId],
      )

      // Get completed job requests
      const [completedRequests] = await pool.query(
        `
        SELECT jr.*, u.name as worker_name, wp.service_category, r.id as review_id, r.rating 
        FROM job_requests jr 
        JOIN worker_profiles wp ON jr.worker_id = wp.id 
        JOIN users u ON wp.user_id = u.id 
        LEFT JOIN reviews r ON jr.id = r.job_id 
        WHERE jr.client_id = ? AND jr.status = 'completed' 
        ORDER BY jr.completed_at DESC 
        LIMIT 5
      `,
        [userId],
      )

      // Get recently viewed workers
      const [recentWorkers] = await pool.query(`
        SELECT wp.*, u.name, u.email 
        FROM worker_profiles wp 
        JOIN users u ON wp.user_id = u.id 
        ORDER BY wp.average_rating DESC 
        LIMIT 4
      `)

      // Ensure average_rating is a number for each worker
      recentWorkers.forEach((worker) => {
        worker.average_rating = Number(worker.average_rating) || 0
      })

      res.render("client-dashboard", {
        title: "Client Dashboard - Jiajiri Hub",
        user,
        activeRequests,
        completedRequests,
        recentWorkers,
      })
    } else {
      res.redirect("/admin/dashboard")
    }
  } catch (error) {
    console.error("Dashboard error:", error)
    res.status(500).render("error", { message: "Failed to load dashboard" })
  }
})

// Worker profile edit page
app.get("/profile/edit", isWorker, async (req, res) => {
  try {
    const userId = req.session.userId

    // Get worker profile
    const [profiles] = await pool.query("SELECT * FROM worker_profiles WHERE user_id = ?", [userId])
    let profile = profiles[0]

    if (!profile) {
      // Create empty profile if it doesn't exist
      const [result] = await pool.query(
        "INSERT INTO worker_profiles (user_id, location, service_category, price_range) VALUES (?, ?, ?, ?)",
        [userId, "", "", ""],
      )

      const [newProfiles] = await pool.query("SELECT * FROM worker_profiles WHERE id = ?", [result.insertId])
      profile = newProfiles[0]
    }

    // Get service categories
    const [categories] = await pool.query("SELECT * FROM service_categories")

    res.render("profile-edit", {
      title: "Edit Profile - Jiajiri Hub",
      profile,
      categories,
      errors: [],
    })
  } catch (error) {
    console.error("Profile edit error:", error)
    res.status(500).render("error", { message: "Failed to load profile edit page" })
  }
})

// Worker profile update
app.post(
  "/profile/edit",
  isWorker,
  upload.single("profile_image"),
  [
    body("bio").trim().notEmpty().withMessage("Bio is required"),
    body("location").trim().notEmpty().withMessage("Location is required"),
    body("service_category").trim().notEmpty().withMessage("Service category is required"),
    body("price_range").trim().notEmpty().withMessage("Price range is required"),
    body("availability").trim().notEmpty().withMessage("Availability is required"),
    body("id_number").optional({ checkFalsy: true }),
  ],
  async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      // Get service categories for re-rendering the form
      const [categories] = await pool.query("SELECT * FROM service_categories")

      return res.render("profile-edit", {
        title: "Edit Profile - Jiajiri Hub",
        profile: { ...req.body, id: req.body.profile_id },
        categories,
        errors: errors.array(),
      })
    }

    try {
      const userId = req.session.userId
      const profileId = req.body.profile_id

      // Prepare update data
      const updateData = {
        bio: req.body.bio,
        location: req.body.location,
        service_category: req.body.service_category,
        price_range: req.body.price_range,
        availability: req.body.availability,
        id_number: req.body.id_number || null,
      }

      // Add image URL if a file was uploaded
      if (req.file) {
        updateData.image_url = "/uploads/" + req.file.filename
      }

      // Update profile
      await pool.query("UPDATE worker_profiles SET ? WHERE id = ? AND user_id = ?", [updateData, profileId, userId])

      res.redirect("/dashboard")
    } catch (error) {
      console.error("Profile update error:", error)
      res.status(500).render("error", { message: "Failed to update profile" })
    }
  },
)

// Worker public profile page
app.get("/worker/:id", async (req, res) => {
  try {
    const workerId = req.params.id

    // Get worker profile with user details
    const [workers] = await pool.query(
      `
      SELECT wp.*, u.name, u.email, u.phone 
      FROM worker_profiles wp 
      JOIN users u ON wp.user_id = u.id 
      WHERE wp.id = ?
    `,
      [workerId],
    )

    if (workers.length === 0) {
      return res.status(404).render("error", { message: "Worker not found" })
    }

    const worker = workers[0]

    // Ensure average_rating is a number
    worker.average_rating = Number(worker.average_rating) || 0

    // Get worker's services
    const [services] = await pool.query("SELECT * FROM services WHERE worker_id = ?", [workerId])

    // Get worker's reviews
    const [reviews] = await pool.query(
      `
      SELECT r.*, u.name as client_name, jr.description as job_description 
      FROM reviews r 
      JOIN users u ON r.client_id = u.id 
      JOIN job_requests jr ON r.job_id = jr.id 
      WHERE r.worker_id = ? 
      ORDER BY r.created_at DESC
    `,
      [workerId],
    )

    res.render("worker-profile", {
      title: `${worker.name} - Jiajiri Hub`,
      worker,
      services,
      reviews,
      isAuthenticated: !!req.session.userId,
      userRole: req.session.userRole,
    })
  } catch (error) {
    console.error("Worker profile error:", error)
    res.status(500).render("error", { message: "Failed to load worker profile" })
  }
})

// Search workers page
app.get("/search", async (req, res) => {
  try {
    const { q, category, location } = req.query

    let query = `
      SELECT wp.*, u.name, u.email, COUNT(r.id) as review_count 
      FROM worker_profiles wp 
      JOIN users u ON wp.user_id = u.id 
      LEFT JOIN reviews r ON wp.id = r.worker_id 
    `

    const queryParams = []
    const conditions = []

    if (q) {
      conditions.push(`(u.name LIKE ? OR wp.bio LIKE ? OR wp.service_category LIKE ?)`)
      const searchTerm = `%${q}%`
      queryParams.push(searchTerm, searchTerm, searchTerm)
    }

    if (category) {
      conditions.push(`wp.service_category = ?`)
      queryParams.push(category)
    }

    if (location) {
      conditions.push(`wp.location LIKE ?`)
      queryParams.push(`%${location}%`)
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(" AND ")}`
    }

    query += ` GROUP BY wp.id ORDER BY wp.average_rating DESC, review_count DESC`

    const [workers] = await pool.query(query, queryParams)

    // Ensure average_rating is a number for each worker
    workers.forEach((worker) => {
      worker.average_rating = Number(worker.average_rating) || 0
    })

    // Get service categories for filter
    const [categories] = await pool.query("SELECT * FROM service_categories")

    res.render("search", {
      title: "Search Workers - Jiajiri Hub",
      workers,
      categories,
      searchQuery: q || "",
      selectedCategory: category || "",
      selectedLocation: location || "",
    })
  } catch (error) {
    console.error("Search error:", error)
    res.status(500).render("error", { message: "Search failed" })
  }
})

// Job request form
app.get("/request/:workerId", isClient, async (req, res) => {
  try {
    const workerId = req.params.workerId

    // Get worker details
    const [workers] = await pool.query(
      `
      SELECT wp.*, u.name, u.email 
      FROM worker_profiles wp 
      JOIN users u ON wp.user_id = u.id 
      WHERE wp.id = ?
    `,
      [workerId],
    )

    if (workers.length === 0) {
      return res.status(404).render("error", { message: "Worker not found" })
    }

    const worker = workers[0]

    res.render("job-request", {
      title: `Request Service from ${worker.name} - Jiajiri Hub`,
      worker,
      errors: [],
    })
  } catch (error) {
    console.error("Job request form error:", error)
    res.status(500).render("error", { message: "Failed to load job request form" })
  }
})

// Submit job request
app.post(
  "/request/:workerId",
  isClient,
  upload.single("job_image"),
  [
    body("description").trim().notEmpty().withMessage("Job description is required"),
    body("location").trim().notEmpty().withMessage("Location is required"),
    body("scheduled_time").isISO8601().withMessage("Valid date and time is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      // Get worker details for re-rendering the form
      const workerId = req.params.workerId
      const [workers] = await pool.query(
        `
      SELECT wp.*, u.name, u.email 
      FROM worker_profiles wp 
      JOIN users u ON wp.user_id = u.id 
      WHERE wp.id = ?
    `,
        [workerId],
      )

      return res.render("job-request", {
        title: `Request Service from ${workers[0].name} - Jiajiri Hub`,
        worker: workers[0],
        errors: errors.array(),
      })
    }

    try {
      const workerId = req.params.workerId
      const clientId = req.session.userId

      // Prepare job request data
      const jobData = {
        client_id: clientId,
        worker_id: workerId,
        description: req.body.description,
        location: req.body.location,
        scheduled_time: req.body.scheduled_time,
        status: "pending",
      }

      // Add image URL if a file was uploaded
      if (req.file) {
        jobData.image_url = "/uploads/" + req.file.filename
      }

      // Insert job request
      await pool.query("INSERT INTO job_requests SET ?", [jobData])

      res.redirect("/dashboard")
    } catch (error) {
      console.error("Job request submission error:", error)
      res.status(500).render("error", { message: "Failed to submit job request" })
    }
  },
)

// Job request management (accept/reject/complete)
app.post("/job/:id/status", isWorker, async (req, res) => {
  try {
    const jobId = req.params.id
    const { status } = req.body
    const userId = req.session.userId

    // Verify that the worker owns this job request
    const [jobs] = await pool.query(
      `
      SELECT jr.* FROM job_requests jr 
      JOIN worker_profiles wp ON jr.worker_id = wp.id 
      WHERE jr.id = ? AND wp.user_id = ?
    `,
      [jobId, userId],
    )

    if (jobs.length === 0) {
      return res.status(403).render("error", { message: "Unauthorized" })
    }

    // Update job status
    if (status === "completed") {
      await pool.query("UPDATE job_requests SET status = ?, completed_at = NOW() WHERE id = ?", [status, jobId])
    } else {
      await pool.query("UPDATE job_requests SET status = ? WHERE id = ?", [status, jobId])
    }

    res.redirect("/dashboard")
  } catch (error) {
    console.error("Job status update error:", error)
    res.status(500).render("error", { message: "Failed to update job status" })
  }
})

// Submit review
app.post(
  "/review/:jobId",
  isClient,
  [
    body("rating").isInt({ min: 1, max: 5 }).withMessage("Rating must be between 1 and 5"),
    body("comment").trim().notEmpty().withMessage("Comment is required"),
  ],
  async (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.redirect("/dashboard")
    }

    try {
      const jobId = req.params.jobId
      const clientId = req.session.userId

      // Verify that the client owns this job request
      const [jobs] = await pool.query(
        'SELECT * FROM job_requests WHERE id = ? AND client_id = ? AND status = "completed"',
        [jobId, clientId],
      )

      if (jobs.length === 0) {
        return res.status(403).render("error", { message: "Unauthorized" })
      }

      const job = jobs[0]

      // Check if review already exists
      const [existingReviews] = await pool.query("SELECT * FROM reviews WHERE job_id = ?", [jobId])

      if (existingReviews.length > 0) {
        return res.redirect("/dashboard")
      }

      // Insert review
      await pool.query("INSERT INTO reviews (job_id, client_id, worker_id, rating, comment) VALUES (?, ?, ?, ?, ?)", [
        jobId,
        clientId,
        job.worker_id,
        req.body.rating,
        req.body.comment,
      ])

      // Update worker's average rating
      await pool.query(
        `
      UPDATE worker_profiles wp
      SET average_rating = (
        SELECT AVG(rating) FROM reviews WHERE worker_id = ?
      )
      WHERE id = ?
    `,
        [job.worker_id, job.worker_id],
      )

      res.redirect("/dashboard")
    } catch (error) {
      console.error("Review submission error:", error)
      res.status(500).render("error", { message: "Failed to submit review" })
    }
  },
)

// Admin dashboard
app.get("/admin/dashboard", isAdmin, async (req, res) => {
  try {
    // Get counts
    const [userCounts] = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM users WHERE role = 'worker') as worker_count,
        (SELECT COUNT(*) FROM users WHERE role = 'client') as client_count,
        (SELECT COUNT(*) FROM job_requests) as job_count,
        (SELECT COUNT(*) FROM job_requests WHERE status = 'completed') as completed_job_count
    `)

    // Get recent users
    const [recentUsers] = await pool.query(`
      SELECT * FROM users ORDER BY created_at DESC LIMIT 5
    `)

    // Get unverified workers
    const [unverifiedWorkers] = await pool.query(`
      SELECT wp.*, u.name, u.email, u.phone 
      FROM worker_profiles wp 
      JOIN users u ON wp.user_id = u.id 
      WHERE wp.is_verified = FALSE AND wp.id_number IS NOT NULL
      ORDER BY u.created_at DESC
    `)

    // Get recent job requests
    const [recentJobs] = await pool.query(`
      SELECT jr.*, c.name as client_name, w.name as worker_name 
      FROM job_requests jr 
      JOIN users c ON jr.client_id = c.id 
      JOIN worker_profiles wp ON jr.worker_id = wp.id 
      JOIN users w ON wp.user_id = w.id 
      ORDER BY jr.created_at DESC LIMIT 10
    `)

    res.render("admin-dashboard", {
      title: "Admin Dashboard - Jiajiri Hub",
      counts: userCounts[0],
      recentUsers,
      unverifiedWorkers,
      recentJobs,
    })
  } catch (error) {
    console.error("Admin dashboard error:", error)
    res.status(500).render("error", { message: "Failed to load admin dashboard" })
  }
})

// Verify worker
app.post("/admin/verify/:workerId", isAdmin, async (req, res) => {
  try {
    const workerId = req.params.workerId

    await pool.query("UPDATE worker_profiles SET is_verified = TRUE WHERE id = ?", [workerId])

    res.redirect("/admin/dashboard")
  } catch (error) {
    console.error("Worker verification error:", error)
    res.status(500).render("error", { message: "Failed to verify worker" })
  }
})

// Admin user management
app.get("/admin/users", isAdmin, async (req, res) => {
  try {
    const [users] = await pool.query(`
      SELECT u.*, 
        CASE 
          WHEN u.role = 'worker' THEN (SELECT wp.is_verified FROM worker_profiles wp WHERE wp.user_id = u.id) 
          ELSE NULL 
        END as is_verified 
      FROM users u 
      ORDER BY u.created_at DESC
    `)

    res.render("admin-users", {
      title: "User Management - Jiajiri Hub",
      users,
    })
  } catch (error) {
    console.error("Admin users error:", error)
    res.status(500).render("error", { message: "Failed to load users" })
  }
})

// About page
app.get("/about", (req, res) => {
  res.render("about", { title: "About Us - Jiajiri Hub" })
})

// Contact page
app.get("/contact", (req, res) => {
  res.render("contact", { 
    title: "Contact Us - Jiajiri Hub",
    error: null,
    success: null,
    formData: {},
    errors: []
  });
});

// Contact form submission
app.post("/contact", [
  body("name").trim().notEmpty().withMessage("Name is required"),
  body("email").isEmail().withMessage("Valid email is required"),
  body("subject").trim().notEmpty().withMessage("Subject is required"),
  body("message").trim().notEmpty().withMessage("Message is required"),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render("contact", {
      title: "Contact Us - Jiajiri Hub",
      error: "Please correct the errors in the form.",
      formData: req.body,
      success: null,
      errors: errors.array()
    });
  }

  try {
    // Insert contact message into database
    await pool.query(
      "INSERT INTO contact_messages (name, email, subject, message) VALUES (?, ?, ?, ?)",
      [req.body.name, req.body.email, req.body.subject, req.body.message]
    );

    // Send success response
    res.render("contact", {
      title: "Contact Us - Jiajiri Hub",
      error: null,
      formData: {},
      success: "Your message has been sent successfully. We'll get back to you soon!",
      errors: []
    });
  } catch (error) {
    console.error("Contact form submission error:", error);
    res.render("contact", {
      title: "Contact Us - Jiajiri Hub",
      error: "Failed to send message. Please try again later.",
      formData: req.body,
      success: null,
      errors: []
    });
  }
});


// Error handling middleware
app.use((req, res) => {
  res.status(404).render("error", { message: "Page not found" })
})

app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).render("error", { message: "Something went wrong!" })
})

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

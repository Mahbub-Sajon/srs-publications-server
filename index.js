const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const axios = require("axios");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.PASSWORD}@cluster0.cwu3x.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server
    // await client.connect();

    const productsCollection = client
      .db("srs-publications")
      .collection("products");
    const cartCollection = client.db("srs-publications").collection("carts");
    const usersCollection = client.db("srs-publications").collection("users");
    const ordersCollection = client.db("srs-publications").collection("orders");
    const paymentsCollection = client
      .db("srs-publications")
      .collection("payments");

    // Endpoint to add a user
    app.post("/api/users", async (req, res) => {
      const { name, email } = req.body;

      if (!name || !email) {
        return res.status(400).send({ message: "Name and email are required" });
      }

      try {
        const user = {
          name,
          email,
          createdAt: new Date(),
        };

        const result = await usersCollection.insertOne(user);
        res.status(201).send({
          message: "User created successfully",
          userId: result.insertedId,
        });
      } catch (error) {
        res.status(500).send({ message: "Error adding user" });
      }
    });

    // Endpoint to get all users
    app.get("/api/users", async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        // console.log(users); // Check if users are being fetched correctly
        res.status(200).send(users);
      } catch (error) {
        res.status(500).send({ message: "Error fetching users" });
      }
    });
    //
    // Endpoint to check if a user is an admin by email
    app.get("/api/users/admin/:email", async (req, res) => {
      const { email } = req.params;

      try {
        const user = await usersCollection.findOne({ email });
        if (user && user.role === "admin") {
          return res.status(200).send({ isAdmin: true });
        }
        res.status(200).send({ isAdmin: false });
      } catch (error) {
        console.error("Error checking admin status:", error);
        res.status(500).send({ message: "Error checking admin status" });
      }
    });
    // Endpoint to get user details by email
    app.get("/api/users/:email", async (req, res) => {
      const { email } = req.params;
      try {
        const user = await usersCollection.findOne({ email });
        if (user) {
          res.status(200).send(user);
        } else {
          res.status(404).send({ message: "User not found" });
        }
      } catch (error) {
        res.status(500).send({ message: "Error fetching user" });
      }
    });
    // Endpoint to update user details
    app.put("/api/users/:email", async (req, res) => {
      const { email } = req.params;
      const { name } = req.body;

      try {
        const updateDoc = {
          $set: {
            name,
          },
        };
        const result = await usersCollection.updateOne({ email }, updateDoc);
        if (result.modifiedCount > 0) {
          res.status(200).send({ message: "User updated successfully" });
        } else {
          res.status(404).send({ message: "User not found" });
        }
      } catch (error) {
        res.status(500).send({ message: "Error updating user" });
      }
    });

    // Endpoint to delete a user
    app.delete("/api/users/:id", async (req, res) => {
      const id = req.params.id;
      try {
        const result = await usersCollection.deleteOne({
          _id: new ObjectId(id),
        });
        if (result.deletedCount === 1) {
          res.status(200).send({ message: "User deleted successfully" });
        } else {
          res.status(404).send({ message: "User not found" });
        }
      } catch (error) {
        res.status(500).send({ message: "Error deleting user" });
      }
    });
    //make admin
    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // Endpoint to add an item to the cart
    app.post("/api/cart", async (req, res) => {
      const { userId, item } = req.body;

      if (!userId || !item) {
        return res
          .status(400)
          .send({ message: "User ID and item are required" });
      }

      try {
        const existingCartItem = await cartCollection.findOne({
          userId,
          "item._id": item._id,
        });

        if (existingCartItem) {
          await cartCollection.updateOne(
            { _id: existingCartItem._id },
            { $inc: { "item.quantity": 1 } }
          );
          res.status(200).send({ message: "Item quantity updated in cart" });
        } else {
          const cartItem = {
            userId,
            item: { ...item, quantity: 1 },
            addedAt: new Date(),
          };

          const result = await cartCollection.insertOne(cartItem);
          res.status(201).send({
            message: "Item added to cart",
            cartItemId: result.insertedId,
          });
        }
      } catch (error) {
        res.status(500).send({ message: "Error adding item to cart" });
      }
    });

    // Endpoint to fetch cart items
    app.get("/cart/:userId", async (req, res) => {
      const { userId } = req.params;

      try {
        const userCartItems = await cartCollection.find({ userId }).toArray();
        res.send(userCartItems);
      } catch (error) {
        res.status(500).send({ message: "Error fetching cart items" });
      }
    });
    // Endpoint to clear a user's cart
    app.delete("/cart/:userId", async (req, res) => {
      const { userId } = req.params;

      try {
        const result = await cartCollection.deleteMany({ userId });

        if (result.deletedCount > 0) {
          res.status(200).send({ message: "Cart cleared successfully" });
        } else {
          res.status(404).send({ message: "No items found in cart" });
        }
      } catch (error) {
        res.status(500).send({ message: "Error clearing cart" });
      }
    });

    // Endpoint to place an order
    app.post("/api/orders", async (req, res) => {
      const { userId, items, address, phone, totalPrice } = req.body;

      if (!userId || !items || !address || !phone || !totalPrice) {
        return res.status(400).send({ message: "All fields are required" });
      }

      try {
        const discountedPrice = totalPrice * 0.85;

        const order = {
          userId,
          items,
          address,
          phone,
          totalPrice: discountedPrice,
          createdAt: new Date(),
        };

        const result = await ordersCollection.insertOne(order);
        res.status(201).send({
          message: "Order placed successfully with discount",
          orderId: result.insertedId,
          discountedPrice, // Return the discounted price
        });
      } catch (error) {
        res.status(500).send({ message: "Error placing order" });
      }
    });

    // Endpoint to get all products
    app.get("/products", async (req, res) => {
      try {
        const result = await productsCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Error fetching products" });
      }
    });
    //add products
    // Endpoint to add a new product
    app.post("/products", async (req, res) => {
      const { image, title, category, quantity, price, description, author } =
        req.body;

      if (
        !image ||
        !title ||
        !category ||
        !quantity ||
        !price ||
        !description ||
        !author
      ) {
        return res.status(400).send({ message: "All fields are required" });
      }

      try {
        const product = {
          image,
          title,
          category,
          quantity: parseInt(quantity),
          price: parseFloat(price),
          description,
          author,
          addedAt: new Date(),
        };

        const result = await productsCollection.insertOne(product);
        res.status(201).send({
          message: "Product added successfully",
          productId: result.insertedId,
        });
      } catch (error) {
        res.status(500).send({ message: "Error adding product" });
      }
    });

    //transaction id
    // const generateTransactionId = new ObjectId().toString();

    // SSLCommerz payment integration
    app.post("/create-payment", async (req, res) => {
      const { orderData } = req.body;

      // Destructure properties from orderData
      const {
        userId,
        userName,
        items,
        address,
        phone,
        totalPrice,
        createdAt,
        email,
        productId,
      } = orderData;

      try {
        // Dynamically generate a unique transaction ID for each payment
        const generateTransactionId = new ObjectId().toString();

        const initiatePayment = {
          store_id: process.env.STORE_ID,
          store_passwd: process.env.STORE_PASSWORD,
          total_amount: totalPrice,
          currency: "BDT",
          tran_id: generateTransactionId, // Use the newly generated transaction ID
          success_url: "https://srs-publications-server.vercel.app/success",
          fail_url: "https://srs-publications-server.vercel.app/fail",
          cancel_url: "https://srs-publications-server.vercel.app/cancel",
          product_name: items.map((item) => item.title).join(", ") || "Product",
          product_id: productId,
          author: items.map((item) => item.author).join(", ") || "Author",
          product_category: "General",
          product_profile: "general",
          cus_name: userName,
          cus_email: email,
          cus_add1: address,
          cus_add2: "Dhaka",
          cus_city: "Dhaka",
          cus_state: "Dhaka",
          cus_postcode: "1000",
          cus_country: "Bangladesh",
          cus_phone: "01711111111",
          cus_fax: "01711111111",
          shipping_method: "NO",
          multi_card_name: "mastercard,visacard,amexcard",
          value_a: "ref001_A",
          value_b: "ref002_B",
          value_c: "ref003_C",
          value_d: "ref004_D",
        };

        const response = await axios({
          method: "POST",
          url: "https://sandbox.sslcommerz.com/gwprocess/v4/api.php",
          data: initiatePayment,
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        });

        // Save payment data to MongoDB
        const saveData = {
          cus_name: userName,
          tran_id: generateTransactionId, // Save the newly generated transaction ID
          total_amount: totalPrice,
          cus_id: userId,
          cus_email: email,
          cus_add: address,
          cus_phone: phone,
          product_id: productId,
          product_name: items.map((item) => item.title).join(", "),
          author: items.map((item) => item.author).join(", "),
          quantity: items.map((item) => item.quantity).join(", "),
          time: createdAt,
          status: "Pending",
        };
        try {
          const result = await paymentsCollection.insertOne(saveData);
          // console.log("Payment data saved successfully:", result);
        } catch (error) {
          console.error("Error inserting payment data into MongoDB:", error);
        }

        // Send the payment URL
        res.send({
          GatewayPageUrl: response.data.GatewayPageURL,
        });
      } catch (error) {
        console.error("Error initiating payment:", error);
        res.status(500).send({ message: "Error initiating payment" });
      }
    });

    // Endpoint to get payment data by transaction ID
    app.get("/api/payments/transaction/:transactionId", async (req, res) => {
      const { transactionId } = req.params;

      try {
        const paymentData = await paymentsCollection.findOne({
          tran_id: transactionId,
        });

        if (paymentData) {
          res.status(200).send(paymentData);
        } else {
          res.status(404).send({ message: "Payment not found" });
        }
      } catch (error) {
        console.error("Error fetching payment data:", error);
        res.status(500).send({ message: "Error fetching payment data" });
      }
    });
    //quantity
    app.get("/api/products/:productId", async (req, res) => {
      const { productId } = req.params;
      try {
        const product = await productsCollection.findOne({ _id: productId });
        if (product) {
          res.status(200).json(product);
        } else {
          res.status(404).json({ message: "Product not found" });
        }
      } catch (error) {
        res.status(500).json({ message: "Error fetching product" });
      }
    });
    //
    //statistics functionality
    //
    // Endpoint to get statistics for best sellers, best authors, and half-yearly sales
    app.get("/api/payments/statistics", async (req, res) => {
      try {
        // Get the current date
        const currentDate = new Date();

        // Calculate date six months ago
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(currentDate.getMonth() - 6);

        // Aggregate best-selling books
        const bestSellersBooks = await paymentsCollection
          .aggregate([
            {
              $group: {
                _id: "$product_name",
                totalSales: { $sum: { $toDouble: "$total_amount" } },
                quantitySold: { $sum: { $toInt: "$quantity" } },
              },
            },
            { $sort: { totalSales: -1 } },
            { $limit: 10 }, // Top 10 best-selling books
          ])
          .toArray();

        // Aggregate best-selling authors
        const bestSellersAuthors = await paymentsCollection
          .aggregate([
            {
              $group: {
                _id: "$author",
                totalSales: { $sum: { $toDouble: "$total_amount" } },
                quantitySold: { $sum: { $toInt: "$quantity" } },
              },
            },
            { $sort: { totalSales: -1 } },
            { $limit: 10 }, // Top 10 best-selling authors
          ])
          .toArray();

        // Calculate half-yearly sales
        const halfYearlySales = await paymentsCollection
          .aggregate([
            {
              $match: {
                time: { $gte: sixMonthsAgo }, // Filter for the last six months
              },
            },
            {
              $group: {
                _id: {
                  $cond: [
                    { $lte: [{ $month: "$time" }, 6] },
                    "January-June",
                    "July-December",
                  ],
                },
                totalSales: { $sum: { $toDouble: "$total_amount" } },
              },
            },
          ])
          .toArray();

        // Prepare half-yearly sales data with placeholders if necessary
        const halfYearlySalesFormatted = [
          { month: "January-June", totalSales: 0 },
          { month: "July-December", totalSales: 0 },
        ];

        halfYearlySales.forEach((item) => {
          const periodIndex = halfYearlySalesFormatted.findIndex(
            (period) => period.month === item._id
          );
          if (periodIndex !== -1) {
            halfYearlySalesFormatted[periodIndex].totalSales = item.totalSales;
          }
        });

        // Send the response with aggregated data
        res.status(200).send({
          bestSellers: bestSellersBooks.map((item) => ({
            productName: item._id,
            totalSales: item.totalSales,
          })),
          bestAuthors: bestSellersAuthors.map((item) => ({
            authorName: item._id,
            totalSales: item.totalSales,
          })),
          halfYearlySales: halfYearlySalesFormatted,
        });
      } catch (error) {
        console.error("Error fetching statistics:", error);
        res.status(500).send({ message: "Error fetching statistics" });
      }
    });

    //
    // Endpoint to get payments by user email
    app.get("/api/payments", async (req, res) => {
      const { email } = req.query; // Get email from query parameters

      if (!email) {
        return res.status(400).send({ message: "Email is required" });
      }

      try {
        const payments = await paymentsCollection
          .find({ cus_email: email })
          .toArray();
        res.status(200).send(payments);
      } catch (error) {
        res.status(500).send({ message: "Error fetching payments" });
      }
    });

    app.post("/success", async (req, res) => {
      const successData = req.body;

      if (successData.status !== "VALID") {
        throw new Error("Unauthorized Payment");
      }

      // Update the database after completing payment
      const query = {
        tran_id: successData.tran_id,
      };
      const update = {
        $set: {
          status: "Success",
        },
      };
      await paymentsCollection.updateOne(query, update);

      // Redirect to frontend with the transaction ID
      res.redirect(
        `https://srs-publications-b3f6c.web.app/success/${successData.tran_id}`
      );
    });

    app.post("/fail", async (req, res) => {
      res.redirect("https://srs-publications-b3f6c.web.app/fail");
    });
    app.post("/cancel", async (req, res) => {
      res.redirect("https://srs-publications-b3f6c.web.app/cancel");
    });

    // Ping to ensure connection works
    // await client.db("admin").command({ ping: 1 });
    // console.log("Connected to MongoDB successfully!");
  } finally {
    // Uncomment in production
    // await client.close();
  }
}

run().catch(console.dir);

// Default route
app.get("/", (req, res) => {
  res.send("srs-publication is publishing");
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

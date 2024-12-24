const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");
const bcrypt = require("bcrypt");

app.http("users-createUser", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "users",
  handler: async (request, context) => {
    await initializeCosmosDb();

    try {
      const body = await request.json(); // Parse JSON body
      const { name, username, email, password, userImageUri } = body;

      if (!name || !username || !email || !password) {
        return {
          status: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "Name, username, email, and password are required.",
          }),
        };
      }

      const newUser = {
        id: `${username}-${Date.now()}`, // Generate unique ID
        type: "user", // Partition key value
        name,
        username,
        email,
        followers: [],
        following: [],
        goalIds: [],
        userImageUri,
      };

      const container = getContainer();

      // Check for existing username or email
      const querySpec = {
        query: `
          SELECT * 
          FROM c 
          WHERE c.type = @type AND (c.username = @username OR c.email = @email)
        `,
        parameters: [
          { name: "@type", value: "user" },
          { name: "@username", value: username },
          { name: "@email", value: email },
        ],
      };

      const { resources: existingUsers } = await container.items
        .query(querySpec)
        .fetchAll();

      if (existingUsers.length > 0) {
        return {
          status: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            error: "A user with the given email or username already exists.",
          }),
        };
      }

      // Hash the password
      const salt = await bcrypt.genSalt(10);
      newUser.password = await bcrypt.hash(password, salt);

      // Create new user
      const { resource: createdUser } = await container.items.create(newUser, {
        partitionKey: "user", // Specify the partition key during insert
      });

      return {
        status: 201,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createdUser),
      };
    } catch (error) {
      context.log("Error creating user:", error.message);
      return {
        status: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Internal Server Error" }),
      };
    }
  },
});

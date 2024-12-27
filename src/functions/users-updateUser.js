const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");

app.http("users-updateUser", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "users/{userId}",
  handler: async (request, context) => {
    await initializeCosmosDb();

    let userId = context.bindingData?.userId;

    if (!userId) {
      const parsedUrl = new URL(request.url);
      const pathSegments = parsedUrl.pathname.split("/");
      userId = pathSegments.pop();
      context.log("Fallback UserId:", userId);
    }

    context.log("user user userId: ", userId);

    if (!userId) {
      context.log.error("UserId parameter is missing or undefined.");
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "UserId is required in the route." }),
      };
    }

    try {
      const container = getContainer();

      // Query to fetch the user
      const querySpec = {
        query: `SELECT * FROM c WHERE c.type = @type AND c.id = @userId`,
        parameters: [
          { name: "@type", value: "user" },
          { name: "@userId", value: userId },
        ],
      };

      const { resources: existingUsers } = await container.items.query(querySpec).fetchAll();

      const existingUser = existingUsers[0]; // Retrieve the first (and only) result
      context.log("updateUser existingUser: ", existingUser);

      if (!existingUser) {
        return {
          status: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "User not found." }),
        };
      }

      const body = await request.json(); // Parse JSON body
      const { name, username, email, userImageUri, followers, following } = body;

      // Validate for email and username uniqueness
      const conflictQuerySpec = {
        query: `
          SELECT * 
          FROM c 
          WHERE c.type = 'user' AND (c.email = @email OR c.username = @username)
        `,
        parameters: [
          { name: "@email", value: email },
          { name: "@username", value: username },
        ],
      };

      const { resources: existingUsersForConflict } = await container.items
        .query(conflictQuerySpec)
        .fetchAll();
      const conflictingUser = existingUsersForConflict.find((u) => u.id !== userId);

      if (conflictingUser) {
        if (conflictingUser.email === email) {
          return {
            status: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "A user with the given email already exists." }),
          };
        }
        if (conflictingUser.username === username) {
          return {
            status: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "A user with the given username already exists." }),
          };
        }
      }

      // Merge updated fields with the existing user
      const updatedUser = {
        ...existingUser,
        ...(name && { name }),
        ...(username && { username }),
        ...(email && { email }),
        ...(userImageUri && { userImageUri }),
        ...(followers && { followers }),
        ...(following && { following }),
      };

      context.log("updateUser updatedUser: ", updatedUser);

      // Replace the user in the database
      const { resource: replacedUser } = await container
        .item(userId, existingUser.type)
        .replace(updatedUser);

      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(replacedUser),
      };
    } catch (error) {
      context.log("Error updating user:", error.message);
      return {
        status: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Internal Server Error" }),
      };
    }
  },
});

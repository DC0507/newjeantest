const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");

app.http("globalLeaders-update", {
  methods: ["PUT"],
  authLevel: "anonymous",
  route: "globalLeaders/{id}",
  handler: async (request, context) => {
    try {
      console.log("full request obj: ", request);
      await initializeCosmosDb();
      let leaderId = context.bindingData?.id;

      // Fallback logic to parse leaderId from the URL if not bound correctly
      if (!leaderId) {
        const parts = request.url.split("/");
        leaderId = parts[parts.length - 1]; // Get the last part of the URL
      }
      console.log("leaderId: ", leaderId);

      const { userId, goalId, completedDays } = await request.json();
      console.log("Request Body - userId: ", userId, " goalId: ", goalId, " completedDays: ", completedDays);

      // Validate inputs
      if (!leaderId || !userId || !goalId || completedDays === undefined) {
        console.error("Missing leaderId, userId, goalId, or completedDays.");
        return {
          status: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Missing leaderId, userId, goalId, or completedDays in request body or URL." }),
        };
      }

      const container = getContainer();

      // Fetch the existing leader by id and partition key (type)
      const partitionKey = "globalLeader"; // Using "type" as the partition key
      const { resource: existingLeader } = await container.item(leaderId, partitionKey).read();
      console.log("Existing Leader: ", existingLeader);

      if (!existingLeader) {
        // If no existing leader, create a new one
        const newLeader = {
          id: leaderId,
          type: partitionKey, // Ensure type is set correctly for partition key
          userId,
          goalId,
          completedDays, // Store completedDays directly in the leader object
        };
        const { resource: createdLeader } = await container.items.create(newLeader);
        console.log("Created New Leader: ", createdLeader);

        return {
          status: 201,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(createdLeader), // Stringify the response
        };
      }

      // Update existing leader if already present
      const updatedLeader = {
        ...existingLeader,
        completedDays: Math.max(existingLeader.completedDays || 0, completedDays), // Update with max completedDays
      };
      console.log("Updated Leader Data: ", updatedLeader);

      // Replace the document using the correct partition key
      const { resource: replacedLeader } = await container
        .item(existingLeader.id, partitionKey) // Ensure correct partition key
        .replace(updatedLeader);
      console.log("Replaced Leader: ", replacedLeader);

      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(replacedLeader), // Stringify the response
      };
    } catch (error) {
      context.error("Error in globalLeaders-update:", error.message);
      return {
        status: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Internal Server Error" }), // Stringify the error response
      };
    }
  },
});

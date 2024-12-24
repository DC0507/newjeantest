const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");

app.http("goals-softDeleteGoal", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "goals/{id}/soft-delete",
  handler: async (request, context) => {
    await initializeCosmosDb();

    let goalId = context.bindingData?.id;
    if (!goalId) {
      const urlSegments = request.url.split('/');
      const index = urlSegments.indexOf("goals");
      if (index !== -1 && urlSegments[index + 1]) {
        goalId = urlSegments[index + 1];
      }
    }

    context.log("goalId: ", goalId);

    if (!goalId) {
      return {
        status: 400,
        body: JSON.stringify({ error: "Goal ID is required in the route." }),
      };
    }

    try {
      const container = getContainer();

      // Fetch the goal using the new partition key (/type)
      const querySpec = {
        query: `SELECT * FROM c WHERE c.id = @goalId AND c.type = 'goal'`,
        parameters: [{ name: "@goalId", value: goalId }],
      };

      const { resources: goals } = await container.items.query(querySpec).fetchAll();

      if (goals.length === 0) {
        return { status: 404, body: JSON.stringify({ error: "Goal not found." }) };
      }

      const existingGoal = goals[0];

      context.log("Existing goal:", existingGoal);

      // Update the isDeleted field
      existingGoal.isDeleted = true;

      // Replace the goal using the new partition key (/type)
      const { resource: replacedGoal } = await container
        .item(existingGoal.id, existingGoal.type) // Pass the correct partition key value
        .replace(existingGoal);

      return { status: 200, body: JSON.stringify(replacedGoal) };
    } catch (error) {
      context.log("Error soft deleting goal:", error.stack);
      return { status: 500, body: JSON.stringify({ error: "Internal Server Error" }) };
    }
  },
});

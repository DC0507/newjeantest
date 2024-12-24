const { app } = require("@azure/functions");
const { initializeCosmosDb, getContainer } = require("../startup/cosmosDb");

app.http("reports-updateReport", {
  methods: ["PATCH"],
  authLevel: "anonymous",
  route: "reports/{id}",
  handler: async (request, context) => {
    await initializeCosmosDb();

    // Extract the report ID, using fallback logic if necessary
    let id = context.bindingData?.id;
    if (!id) {
      const urlParts = request.url.split("/");
      id = urlParts[4]; // Adjust index based on URL structure
      context.log("Fallback Report ID:", id);
    }

    if (!id) {
      context.log("Report ID parameter is missing or undefined.");
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Report ID is required in the route." }),
      };
    }

    try {
      const container = getContainer();
      const { resource: existingReport } = await container.item(id).read();

      if (!existingReport) {
        context.log(`No report found with ID: ${id}`);
        return {
          status: 404,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ error: "Report not found." }),
        };
      }

      const body = await request.json(); // Parse JSON body
      const updatedReport = { ...existingReport, ...body }; // Merge updated fields

      const { resource: replacedReport } = await container.item(id, existingReport.partitionKey).replace(updatedReport);

      return {
        status: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(replacedReport),
      };
    } catch (error) {
      context.log("Error updating report:", error.message);
      return {
        status: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Internal Server Error" }),
      };
    }
  },
});

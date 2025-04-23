const fetch = require("node-fetch");

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const LAYER_API_KEY = process.env.LAYER_API_KEY;

const TABLE_NAME = "Templates";

exports.handler = async function (event, context) {
  try {
    const airtableURL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE_NAME)}?filterByFormula=Status='Push'&maxRecords=1`;

    const recordsResponse = await fetch(airtableURL, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      },
    });

    const { records } = await recordsResponse.json();
    if (!records.length) {
      console.log("No records to process.");
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "No records to process." }),
      };
    }

    const record = records[0];
    const templateName = record.fields["Template Name"];
    const schemaText = record.fields.JSON;

    if (!templateName || !schemaText) {
      console.log("Missing Template Name or JSON schema.");
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing Template Name or JSON schema" }),
      };
    }

    const schema = JSON.parse(schemaText);

    // Step 1: Create Layer project
    const projectRes = await fetch("https://api.layer.team/v1/projects", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LAYER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: templateName,
        isPublic: true,
      }),
    });

    const projectData = await projectRes.json();
    console.log("📦 Layer project API response:", projectData); // 🧠 Debug here

    if (!projectData || !projectData.id) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Failed to create Layer project", details: projectData }),
      };
    }

    const projectId = projectData.id;
    const projectURL = `https://app.layer.team/project/${projectId}`;

    // Step 2: Add categories + fields
    for (const category of schema) {
      const catRes = await fetch(`https://api.layer.team/v1/projects/${projectId}/categories`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LAYER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: category.name }),
      });

      const catData = await catRes.json();
      const categoryId = catData.id;

      for (const field of category.fields) {
        await fetch(`https://api.layer.team/v1/categories/${categoryId}/fields`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LAYER_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: field.name,
            type: field.type,
            ...(field.options ? { options: field.options } : {}),
          }),
        });
      }
    }

    // Step 3: Update Airtable
    await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${TABLE_NAME}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        records: [
          {
            id: record.id,
            fields: {
              "Layer Project URL": projectURL,
              "Status": "Published",
            },
          },
        ],
      }),
    });

    console.log(`✅ Template '${templateName}' published: ${projectURL}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Template pushed and published.",
        projectURL,
      }),
    };
  } catch (err) {
    console.error("❌ Error during function run:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

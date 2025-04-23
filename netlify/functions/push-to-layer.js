const fetch = require("node-fetch");

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const LAYER_API_KEY = process.env.LAYER_API_KEY;

const TABLE_NAME = "Templates";

exports.handler = async function (event, context) {
  try {
    const airtableURL = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(TABLE_NAME)}?filterByFormula=Status='Push'`;

    const recordsResponse = await fetch(airtableURL, {
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      },
    });

    const { records } = await recordsResponse.json();

    for (const record of records) {
      const templateName = record.fields["Template Name"];
      const schemaText = record.fields.JSON;

      if (!templateName || !schemaText) continue;

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
      const projectId = projectData.id;
      const projectURL = `https://app.layer.team/project/${projectId}`;

      console.log(`📁 Created Layer project: ${projectId}`);

      // Step 2: Add categories and fields
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
              ...(field.options ? { options: field.options } : {})
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
                "Status": "Published"
              }
            }
          ]
        }),
      });

      console.log(`✅ Template '${templateName}' published to Layer: ${projectURL}`);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: "All push-ready templates published." }),
    };
  } catch (err) {
    console.error("❌ Error pushing to Layer:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

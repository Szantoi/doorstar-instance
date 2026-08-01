import type { Express } from "express";
import request from "supertest";

/** Registers one exact survey document version and explicitly scopes it to
 * every supplied order position. Field evidence remains optional; individual
 * tests add it only when they exercise the evidence-review branch. */
export async function attachSurveySource(
  app: Express,
  projectKey: string,
  positionIds: string[],
) {
  const document = await request(app)
    .post(`/api/production/production-orders/${projectKey}/revisions/1/documents`)
    .set("X-Role", "technical_preparation")
    .send({
      source: "LEGACY_FOLDER",
      kind: "SURVEY",
      displayName: "Felmérési lap.pdf",
      relativePath: `${projectKey}/Felmeresi-lap.pdf`,
    })
    .expect(201);
  for (const positionId of positionIds) {
    await request(app)
      .post(`/api/production/production-orders/${projectKey}/revisions/1/documents/${document.body.id}/positions`)
      .set("X-Role", "technical_preparation")
      .send({ orderPositionId: positionId })
      .expect(201);
  }
  return document.body as { id: string };
}

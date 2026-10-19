import { expect, type Locator, type Page } from '@playwright/test';

export const implementationDetails =
  /\b(?:bekko|horizon|lance(?:db)?|onnx(?:runtime)?|openvino|sqlite|sqlalchemy|fastapi|astro|react|embedding\w*|rerank\w*|bm25|cpu|cuda|backend|frontend|pipeline)\b|IA local|evaluaci[oó]n estructurada|versi[oó]n de reglas|sem[aá]ntic[ao]/i;

export async function expectProductLanguage(target: Page | Locator) {
  const content = 'url' in target ? target.locator('body') : target;
  await expect(content).not.toContainText(implementationDetails);
}

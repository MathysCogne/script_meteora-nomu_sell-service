import fs from 'fs';
import { BodyItem, ProofRecord } from '../../../utils/types';
import { chunks } from '../../../helpers';

export async function uploadProof(
  kvProofFilepath: string,
  vaultAddress: string,
  kvNameSpaceId: string,
  accountId: string,
  apiKey: string
) {
  // 1. Read merkle proof files from the folder
  const proofFolder = fs.readdirSync(kvProofFilepath);
  const files: ProofRecord[] = [];

  for (const fileName of proofFolder) {
    const path = `./${kvProofFilepath}/${fileName}`;
    console.log(`> Reading file ${path}`);
    const file = fs.readFileSync(path, 'utf-8');
    const json = JSON.parse(file) as ProofRecord;
    files.push(json);
  }

  // 2. Upload them to KV
  for (const file of files) {
    const proofsArr = Object.entries(file);
    for (const chunk of chunks(proofsArr, 10000)) {
      const items: BodyItem[] = chunk.map(([walletAddress, value]) => ({
        key: `${vaultAddress}-${walletAddress}`,
        value: JSON.stringify(value),
        base64: false,
      }));

      await Promise.all(
        chunks(items, 250).map(async (body) => {
          let success = false;
          while (!success) {
            const resp = await fetch(
              `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${kvNameSpaceId}/bulk`,
              {
                body: JSON.stringify(body),
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  'Content-Type': 'application/json',
                },
                method: 'PUT',
              }
            ).then(async (res) => {
              const text = await res.text();
              console.log({ text });
              return JSON.parse(text) as Promise<{ success: boolean }>;
            });

            if (resp.success) {
              success = true;
            }
          }
        })
      );
    }
  }
}

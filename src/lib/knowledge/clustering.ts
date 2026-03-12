import { prisma } from "@/lib/prisma";
import { cosineSimilarity } from "@/lib/search/embedding";
import { analyzeWithAI } from "./ai-analysis";
import { rebuildAllClusterRelations } from "./cluster-relations";

const SIMILARITY_THRESHOLD = 0.70;

// Assign a single QASet to nearest cluster (called on share)
export async function assignToCluster(qaSetId: string): Promise<string | null> {
  const qaSet = await prisma.qASet.findUnique({
    where: { id: qaSetId },
    select: { id: true, title: true, embedding: true, topicClusterId: true },
  });
  if (!qaSet?.embedding || qaSet.topicClusterId) return qaSet?.topicClusterId ?? null;

  const embedding = JSON.parse(qaSet.embedding) as number[];

  // Find best matching cluster by centroid similarity
  const clusters = await prisma.topicCluster.findMany({
    where: { centroidEmbedding: { not: null } },
    select: { id: true, name: true, centroidEmbedding: true },
  });

  let bestCluster: { id: string; similarity: number } | null = null;
  for (const cluster of clusters) {
    const centroid = JSON.parse(cluster.centroidEmbedding!) as number[];
    const sim = cosineSimilarity(embedding, centroid);
    if (sim > SIMILARITY_THRESHOLD && (!bestCluster || sim > bestCluster.similarity)) {
      bestCluster = { id: cluster.id, similarity: sim };
    }
  }

  if (bestCluster) {
    // Assign to existing cluster and update centroid
    await prisma.qASet.update({ where: { id: qaSetId }, data: { topicClusterId: bestCluster.id } });
    await updateClusterCentroid(bestCluster.id);
    return bestCluster.id;
  }

  // No matching cluster — check if similar to other unclustered QASets
  // If not, create singleton cluster
  const clusterName = await generateClusterName(qaSet.title ?? "");
  const newCluster = await prisma.topicCluster.create({
    data: {
      name: clusterName.name,
      nameEn: clusterName.nameEn,
      description: clusterName.description,
      centroidEmbedding: qaSet.embedding,
    },
  });
  await prisma.qASet.update({ where: { id: qaSetId }, data: { topicClusterId: newCluster.id } });
  return newCluster.id;
}

// Full re-clustering of all shared QASets (admin/cron endpoint)
export async function runFullClustering(): Promise<{ clusterCount: number; assignedCount: number }> {
  const qaSets = await prisma.qASet.findMany({
    where: { isShared: true, embedding: { not: null } },
    select: { id: true, title: true, embedding: true },
  });

  if (qaSets.length === 0) return { clusterCount: 0, assignedCount: 0 };

  // Parse embeddings
  const items = qaSets.map((q) => ({
    id: q.id,
    title: q.title,
    embedding: JSON.parse(q.embedding!) as number[],
  }));

  // Simple agglomerative clustering
  const clusters: { members: typeof items }[] = [];
  const assigned = new Set<string>();

  for (const item of items) {
    if (assigned.has(item.id)) continue;

    // Find all items similar to this one
    const group = [item];
    assigned.add(item.id);

    for (const other of items) {
      if (assigned.has(other.id)) continue;
      const sim = cosineSimilarity(item.embedding, other.embedding);
      if (sim > SIMILARITY_THRESHOLD) {
        group.push(other);
        assigned.add(other.id);
      }
    }

    clusters.push({ members: group });
  }

  // Delete old clusters and create new ones
  await prisma.topicCluster.deleteMany({});

  let assignedCount = 0;
  for (const cluster of clusters) {
    // Compute centroid
    const dim = cluster.members[0].embedding.length;
    const centroid = new Array(dim).fill(0);
    for (const m of cluster.members) {
      for (let i = 0; i < dim; i++) centroid[i] += m.embedding[i];
    }
    for (let i = 0; i < dim; i++) centroid[i] /= cluster.members.length;

    const titles = cluster.members.map((m) => m.title ?? "").filter(Boolean).slice(0, 5);
    const clusterName = await generateClusterName(titles.join(", "));

    const created = await prisma.topicCluster.create({
      data: {
        name: clusterName.name,
        nameEn: clusterName.nameEn,
        description: clusterName.description,
        centroidEmbedding: JSON.stringify(centroid),
      },
    });

    await prisma.qASet.updateMany({
      where: { id: { in: cluster.members.map((m) => m.id) } },
      data: { topicClusterId: created.id },
    });

    assignedCount += cluster.members.length;
  }

  // Rebuild cluster-to-cluster relations after full re-clustering
  await rebuildAllClusterRelations().catch(() => {});

  return { clusterCount: clusters.length, assignedCount };
}

async function updateClusterCentroid(clusterId: string): Promise<void> {
  const members = await prisma.qASet.findMany({
    where: { topicClusterId: clusterId, embedding: { not: null } },
    select: { embedding: true },
  });
  if (members.length === 0) return;

  const embeddings = members.map((m) => JSON.parse(m.embedding!) as number[]);
  const dim = embeddings[0].length;
  const centroid = new Array(dim).fill(0);
  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) centroid[i] += emb[i];
  }
  for (let i = 0; i < dim; i++) centroid[i] /= embeddings.length;

  await prisma.topicCluster.update({
    where: { id: clusterId },
    data: { centroidEmbedding: JSON.stringify(centroid) },
  });
}

async function generateClusterName(titles: string): Promise<{ name: string; nameEn: string | null; description: string | null }> {
  const result = await analyzeWithAI<{ name: string; nameEn: string; description: string }>({
    prompt: `다음 Q&A 제목들의 공통 주제를 파악하고 주제 이름을 생성하세요.

제목들: ${titles.slice(0, 500)}

JSON으로 응답:
{"name": "한국어 주제명 (5단어 이내)", "nameEn": "English topic name", "description": "한국어 설명 (1문장)"}`,
  });

  return {
    name: result?.name ?? titles.slice(0, 30),
    nameEn: result?.nameEn ?? null,
    description: result?.description ?? null,
  };
}

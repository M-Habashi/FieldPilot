import type { Doc } from '../_generated/dataModel';

type QuantityReportInput = {
  tasks: Doc<'tasks'>[];
  sheets: Doc<'sheets'>[];
  items: Doc<'quantityItems'>[];
  quantityLines: Doc<'taskQuantities'>[];
};

function taskHasLegacyQuantity(task: Doc<'tasks'>) {
  return (
    task.quantityItemId !== undefined ||
    task.plannedQuantity !== undefined ||
    task.completedQuantity !== undefined
  );
}

// Shared by the regular quantities screen and the agent read tool so both
// surfaces report the same rows and legacy-quantity behavior.
export function buildProjectQuantityReport({
  tasks,
  sheets,
  items,
  quantityLines,
}: QuantityReportInput) {
  const sheetById = new Map(sheets.map((sheet) => [sheet._id, sheet]));
  const itemById = new Map(items.map((item) => [item._id, item]));
  const taskById = new Map(tasks.map((task) => [task._id, task]));
  const taskIdsWithLines = new Set(quantityLines.map((line) => line.taskId));
  const reportLines = [
    ...quantityLines.map((line) => ({
      reportLineId: line._id as string,
      taskId: line.taskId,
      quantityItemId: line.quantityItemId,
      plannedQuantity: line.plannedQuantity,
      completedQuantity: line.completedQuantity,
      quantityUnit: line.quantityUnit,
    })),
    ...tasks
      .filter((task) => !taskIdsWithLines.has(task._id) && taskHasLegacyQuantity(task))
      .map((task) => ({
        reportLineId: `legacy:${task._id}`,
        taskId: task._id,
        quantityItemId: task.quantityItemId,
        plannedQuantity: task.plannedQuantity,
        completedQuantity: task.completedQuantity,
        quantityUnit: task.quantityUnit,
      })),
  ];

  return reportLines
    .flatMap((line) => {
      const task = taskById.get(line.taskId);
      if (!task) return [];
      const sheet = sheetById.get(task.sheetId);
      const item = line.quantityItemId ? itemById.get(line.quantityItemId) : undefined;
      return [
        {
          reportLineId: line.reportLineId,
          taskId: task._id,
          sheetId: task.sheetId,
          seq: task.seq,
          title: task.title,
          status: task.status,
          category: task.category,
          assigneeText: task.assigneeText,
          plannedQuantity: line.plannedQuantity,
          completedQuantity: line.completedQuantity,
          quantityUnit: line.quantityUnit,
          quantityItemId: line.quantityItemId,
          itemName: item?.name,
          itemArchived: item?.archivedAt !== undefined,
          planName: sheet?.name ?? 'Unknown plan',
          planNumber: sheet?.number ?? '',
          planPage: sheet ? sheet.pageIndex + 1 : 1,
          sourceFileRef: sheet?.sourceFileRef ?? '',
        },
      ];
    })
    .sort((a, b) => a.seq - b.seq);
}

import { auth } from "@/lib/auth";
import { NextRequest } from "next/server";
import { processInvestment, InvestmentValidationError } from "@/lib/services/investment.service";
import { success, unauthorized, error, serverError } from "@/lib/api-response";

// POST /api/qa-sets/[id]/invest
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  const { id } = await params;
  const body = await req.json();

  const isNegative = body.isNegative === true;

  try {
    const result = await processInvestment({
      userId: session.user.id,
      userName: session.user.name ?? null,
      qaSetId: id,
      amount: body.amount,
      isNegative,
      comment: body.comment ? String(body.comment).slice(0, 100) : undefined,
      huntingReason: isNegative ? body.huntingReason : undefined,
      huntingEvidence: isNegative ? body.huntingEvidence?.slice(0, 500) : undefined,
      huntingTargetMessageId: isNegative ? body.huntingTargetMessageId : undefined,
    });

    return success(result);
  } catch (err) {
    if (err instanceof InvestmentValidationError) {
      return error(
        err.message,
        err.statusCode,
      );
    }
    return serverError(err, "invest");
  }
}

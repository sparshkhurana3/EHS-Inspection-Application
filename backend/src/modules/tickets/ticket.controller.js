import path from "node:path";

import * as ticketService
  from "./ticket.service.js";

export async function getHodTickets(
  req,
  res,
  next,
) {
  try {
    const result =
      await ticketService.getHodTickets({
        userId: req.user.id,
      });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getTicketLookups(
  req,
  res,
  next,
) {
  try {
    const result =
      await ticketService.getTicketLookups();

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getTicketById(
  req,
  res,
  next,
) {
  try {
    const result =
      await ticketService.getTicketById({
        userId: req.user.id,
        ticketId: req.params.ticketId,
      });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function acceptTicket(
  req,
  res,
  next,
) {
  try {
    const result =
      await ticketService.acceptTicket({
        userId: req.user.id,
        ticketId: req.params.ticketId,
        comments: req.body.comments,

        correctiveActionTypeId:
          req.body.correctiveActionTypeId,
      });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function rejectTicket(
  req,
  res,
  next,
) {
  try {
    const result =
      await ticketService.rejectTicket({
        userId: req.user.id,
        ticketId: req.params.ticketId,
        comments: req.body.comments,

        correctiveActionTypeId:
          req.body.correctiveActionTypeId,
      });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function addEvidence(
  req,
  res,
  next,
) {
  try {
    const result =
      await ticketService.addEvidence({
        userId: req.user.id,
        ticketId: req.params.ticketId,
        files: req.files,
      });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

export async function removeEvidence(
  req,
  res,
  next,
) {
  try {
    const result =
      await ticketService.removeEvidence({
        userId: req.user.id,
        ticketId: req.params.ticketId,

        evidenceId:
          req.params.evidenceId,
      });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function closeTicket(
  req,
  res,
  next,
) {
  try {
    const result =
      await ticketService.closeTicket({
        userId: req.user.id,
        ticketId: req.params.ticketId,

        completionNotes:
          req.body.completionNotes,
      });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export async function getTicketEvidence(
  req,
  res,
  next,
) {
  try {
    const evidence =
      await ticketService.getEvidenceFile({
        userId: req.user.id,
        ticketId: req.params.ticketId,

        evidenceId:
          req.params.evidenceId,
      });

    res.type(evidence.mimeType);

    res.setHeader(
      "Content-Disposition",
      `inline; filename="${path.basename(
        evidence.originalName,
      )}"`,
    );

    res.setHeader(
      "Cache-Control",
      "private, max-age=300",
    );

    res.sendFile(
      evidence.absolutePath,
    );
  } catch (error) {
    next(error);
  }
}

import * as dashboardService
  from "./dashboard.service.js";

export async function getDashboard(
  req,
  res,
  next,
) {
  try {
    const dashboard =
      await dashboardService.getDashboardData({
        user: req.user,
        year: req.query.year,
        month: req.query.month,
      });

    res.status(200).json(dashboard);
  } catch (error) {
    next(error);
  }
}

export async function getOfficerWeek(
  req,
  res,
  next,
) {
  try {
    const officerWeek =
      await dashboardService.getOfficerWeek({
        user: req.user,
        weekStart: req.query.weekStart,
      });

    res.status(200).json({
      officerWeek,
    });
  } catch (error) {
    next(error);
  }
}
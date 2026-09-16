import {
  getDashboardData,
} from "./dashboard.service.js";

export async function getDashboard(
  req,
  res,
  next,
) {
  try {
    const dashboard =
      await getDashboardData({
        user: req.user,
        year: req.query.year,
        month: req.query.month,
      });

    res.status(200).json(dashboard);
  } catch (error) {
    next(error);
  }
}
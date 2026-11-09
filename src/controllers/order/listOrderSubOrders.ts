import type { NextFunction, Request, Response } from "express";
import Shipment, { type ShipmentDocument } from "@/models/shipment.model";
import type { OrderDocument } from "@/models/order.model";
import { orderSubOrdersQuerySchema } from "@/schemas/order";
import {
  attachShipmentsToOrders,
  findOrderOrThrow,
  querySubOrders,
} from "@/services/orders/query";

export const listOrderSubOrders = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = orderSubOrdersQuerySchema.parse(req.query);
    const selected = await findOrderOrThrow(String(req.params.orderId));
    const result = await querySubOrders(selected, query);

    const orders = result.subOrders as OrderDocument[];
    const ids = orders.map((order) => order._id);
    const shipments = (await Shipment.find({
      order: { $in: ids },
    }).lean()) as unknown as ShipmentDocument[];

    res.status(200).json({
      message: "Sub-orders retrieved successfully",
      success: true,
      data: {
        subOrders: attachShipmentsToOrders(orders, shipments),
        pagination: result.pagination,
      },
    });
  } catch (error) {
    next(error);
  }
};

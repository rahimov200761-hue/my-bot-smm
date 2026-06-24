import axios from "axios";

const SMM_API_URL = process.env["SMM_API_URL"] || "https://smmmain.com/api/v2";
const SMM_API_KEY = process.env["SMM_API_KEY"] || "";

const api = axios.create({ baseURL: SMM_API_URL });

export async function getServices() {
  try {
    const { data } = await api.post("", null, {
      params: { key: SMM_API_KEY, action: "services" },
    });
    return data;
  } catch {
    return [];
  }
}

export async function createOrder(params: {
  service: string | number;
  link: string;
  quantity: number;
}) {
  const { data } = await api.post("", null, {
    params: {
      key: SMM_API_KEY,
      action: "add",
      service: params.service,
      link: params.link,
      quantity: params.quantity,
    },
  });
  return data;
}

export async function getOrderStatus(orderId: string) {
  try {
    const { data } = await api.post("", null, {
      params: { key: SMM_API_KEY, action: "status", order: orderId },
    });
    return data;
  } catch {
    return { status: "unknown" };
  }
}

export async function getBalance() {
  try {
    const { data } = await api.post("", null, {
      params: { key: SMM_API_KEY, action: "balance" },
    });
    return data;
  } catch {
    return { balance: "N/A", currency: "USD" };
  }
}

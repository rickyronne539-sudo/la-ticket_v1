import { redirect } from "next/navigation";
import { currentCustomer, safeNext } from "@/lib/customer";
import { CustomerForm } from "@/components/customer-form";
export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await currentCustomer()) redirect(next);
  return <div className="mx-auto max-w-md py-8"><CustomerForm next={next}/></div>;
}
